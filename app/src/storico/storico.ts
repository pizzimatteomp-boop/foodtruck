/**
 * Storico di prezzi e food cost. Puro e testato.
 * - Prezzo pagato mese per mese: dagli acquisti (restano per sempre), media pesata del mese, totale e per fonte.
 * - Fotografia mensile: prezzi e food cost a fine mese, salvata una volta e mai più modificata.
 * - Andamento del food cost: dalle fotografie; per i mesi senza, ricalcolato con le ricette attuali (e segnalato).
 */
import BigNumber from 'bignumber.js';
import { foodCost } from '../foodcost/calcolo';
import type { Acquisto, Articolo, Ingrediente, Prodotto } from '../foodcost/modello';

export const FINESTRA_GIORNI = 60;
type Dati = { ingredienti: readonly Ingrediente[]; prodotti: readonly Prodotto[]; articoli: readonly Articolo[]; acquisti: readonly Acquisto[] };

/** «2026-10» → ultimo giorno del mese. */
export function fineMese(mese: string): string {
  const [a, m] = mese.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}
export const meseDi = (data: string) => data.slice(0, 7);
export function meseSpostato(mese: string, di: number): string {
  const [a, m] = mese.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(a, m - 1 + di, 1));
  return d.toISOString().slice(0, 7);
}
/** Mesi da «da» ad «a» compresi. */
export function mesiTra(da: string, a: string): string[] {
  const r: string[] = [];
  for (let m = da; m <= a && r.length < 240; m = meseSpostato(m, 1)) r.push(m);
  return r;
}
const NOMI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export const nomeMese = (mese: string, lungo = false) => {
  const n = NOMI[Number(mese.slice(5, 7)) - 1]!;
  return lungo ? `${['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'][Number(mese.slice(5, 7)) - 1]} ${mese.slice(0, 4)}` : `${n} ${mese.slice(2, 4)}`;
};

export interface PrezzoMese { mese: string; prezzo: number | null; perFonte: Record<string, number> }

/** Prezzo medio pagato per unità di ingrediente, mese per mese, da tutti gli articoli collegati. */
export function prezziMensili(ingrediente: string, articoli: readonly Articolo[], acquisti: readonly Acquisto[], mesi: readonly string[]): PrezzoMese[] {
  const fattori = new Map(articoli.filter((a) => a.ingrediente === ingrediente).map((a) => [a.id, a.fattore > 0 ? a.fattore : 1] as const));
  const somma = new Map<string, { v: BigNumber; q: BigNumber; fonti: Map<string, { v: BigNumber; q: BigNumber }> }>();
  for (const a of acquisti) {
    const f = a.articolo ? fattori.get(a.articolo) : undefined;
    if (f === undefined || !(a.quantita > 0)) continue;
    const m = meseDi(a.data);
    const s = somma.get(m) ?? { v: new BigNumber(0), q: new BigNumber(0), fonti: new Map() };
    const v = new BigNumber(a.quantita).times(a.prezzoUnitario), q = new BigNumber(a.quantita).times(f);
    s.v = s.v.plus(v); s.q = s.q.plus(q);
    const fo = s.fonti.get(a.articolo!) ?? { v: new BigNumber(0), q: new BigNumber(0) };
    s.fonti.set(a.articolo!, { v: fo.v.plus(v), q: fo.q.plus(q) });
    somma.set(m, s);
  }
  return mesi.map((mese) => {
    const s = somma.get(mese);
    if (!s || s.q.isZero()) return { mese, prezzo: null, perFonte: {} };
    return { mese, prezzo: s.v.div(s.q).toNumber(), perFonte: Object.fromEntries([...s.fonti].map(([k, x]) => [k, x.v.div(x.q).toNumber()])) };
  });
}

/** Variazione % tra due prezzi (null se manca uno dei due). */
export function variazione(da: number | null | undefined, a: number | null | undefined): number | null {
  return da && a !== null && a !== undefined && da > 0 ? ((a - da) / da) * 100 : null;
}

export interface Fotografia {
  mese: string;
  ingredienti: Record<string, { nome: string; unita: string; prezzo: number | null; stato: string }>;
  prodotti: Record<string, { nome: string; prezzo: number; costo: number; percentuale: number | null; completo: boolean }>;
}

/** Prezzi e food cost a fine mese (prezzo = media degli ultimi 60 giorni a quella data). */
export function fotografia(mese: string, d: Dati): Fotografia {
  const fc = foodCost(d, { finestraGiorni: FINESTRA_GIORNI, oggi: fineMese(mese) });
  return {
    mese,
    ingredienti: Object.fromEntries(d.ingredienti.map((i) => {
      const p = fc.prezzi.get(i.id)!;
      return [i.id, { nome: i.nome, unita: i.unita, prezzo: p.prezzo?.toNumber() ?? null, stato: p.stato }];
    })),
    prodotti: Object.fromEntries(d.prodotti.filter((p) => p.tipo === 'vendibile').map((p) => {
      const c = fc.prodotti.get(p.id)!;
      return [p.id, { nome: p.nome, prezzo: p.prezzo, costo: c.costoUnitario.toNumber(), percentuale: c.percentuale?.toNumber() ?? null, completo: c.completo }];
    })),
  };
}

/** Mese della fotografia da salvare oggi: il mese scorso, se ci sono acquisti fino ad allora e non è già salvata. */
export function fotografiaDaSalvare(oggi: string, salvate: ReadonlySet<string>, acquisti: readonly Acquisto[]): string | null {
  const scorso = meseSpostato(meseDi(oggi), -1);
  if (salvate.has(scorso)) return null;
  return acquisti.some((a) => a.data <= fineMese(scorso)) ? scorso : null;
}

export interface PuntoFoodCost { mese: string; percentuale: number | null; costo: number | null; origine: 'fotografia' | 'ricalcolato' | 'oggi' }

/** Food cost di un prodotto mese per mese: fotografie dove ci sono, ricalcolo con le ricette attuali dove mancano, oggi alla fine. */
export function andamentoFoodCost(id: string, mesi: readonly string[], fotografie: ReadonlyMap<string, Fotografia>, d: Dati, oggi: string): PuntoFoodCost[] {
  const corrente = meseDi(oggi);
  return mesi.map((mese) => {
    const f = fotografie.get(mese)?.prodotti[id];
    if (f) return { mese, percentuale: f.percentuale, costo: f.costo, origine: 'fotografia' as const };
    const data = mese === corrente ? oggi : fineMese(mese);
    const c = foodCost(d, { finestraGiorni: FINESTRA_GIORNI, oggi: data }).prodotti.get(id);
    return { mese, percentuale: c?.percentuale?.toNumber() ?? null, costo: c?.costoUnitario.toNumber() ?? null, origine: mese === corrente ? 'oggi' as const : 'ricalcolato' as const };
  });
}

export interface Avviso { tipo: 'soglia' | 'rincaro' | 'senza-prezzo' | 'prezzo-vecchio'; testo: string; link: string; valore?: number }

/**
 * Avvisi sul food cost:
 * - prodotto in vendita oltre la sua soglia;
 * - ingrediente rincarato oltre la soglia % rispetto alla fine del mese scorso;
 * - ingredienti usati nei prodotti in menu senza prezzo o con prezzo vecchio.
 */
export function avvisiFoodCost(d: Dati, oggi: string, sogliaRincaro: number): Avviso[] {
  const ora = foodCost(d, { finestraGiorni: FINESTRA_GIORNI, oggi });
  const prima = foodCost(d, { finestraGiorni: FINESTRA_GIORNI, oggi: fineMese(meseSpostato(meseDi(oggi), -1)) });
  const out: Avviso[] = [];
  for (const p of d.prodotti) {
    const c = ora.prodotti.get(p.id)!;
    if (p.tipo === 'vendibile' && p.soglia && c.percentuale?.gt(p.soglia)) {
      out.push({ tipo: 'soglia', testo: `${p.nome}: food cost ${c.percentuale.toFixed(1).replace('.', ',')}% (soglia ${p.soglia}%)`, link: `#/prodotti/${encodeURIComponent(p.id)}`, valore: c.percentuale.toNumber() });
    }
  }
  const usatiInMenu = new Set<string>();
  const raccogli = (id: string, visti: Set<string>) => {
    const p = d.prodotti.find((x) => x.id === id);
    if (!p || visti.has(id)) return;
    visti.add(id);
    for (const r of p.ricetta) r.tipo === 'ingrediente' ? usatiInMenu.add(r.id) : raccogli(r.id, visti);
  };
  for (const p of d.prodotti) if (p.inMenu) raccogli(p.id, new Set());
  for (const i of [...d.ingredienti].sort((a, b) => a.nome.localeCompare(b.nome, 'it'))) {
    const a = ora.prezzi.get(i.id)!, b = prima.prezzi.get(i.id)!;
    const v = variazione(b.prezzo?.toNumber(), a.prezzo?.toNumber());
    if (v !== null && v > sogliaRincaro) {
      out.push({ tipo: 'rincaro', testo: `${i.nome}: +${v.toFixed(0)}% rispetto alla fine del mese scorso`, link: `#/ingredienti/${encodeURIComponent(i.id)}`, valore: v });
    }
    if (usatiInMenu.has(i.id)) {
      if (a.stato === 'mancante') out.push({ tipo: 'senza-prezzo', testo: `${i.nome}: senza prezzo, usato nei prodotti in menu`, link: `#/ingredienti/${encodeURIComponent(i.id)}` });
      else if (a.stato === 'vecchio') out.push({ tipo: 'prezzo-vecchio', testo: `${i.nome}: prezzo vecchio (ultimo acquisto ${a.ultimoAcquisto!.split('-').reverse().join('/')})`, link: `#/ingredienti/${encodeURIComponent(i.id)}` });
    }
  }
  const ordine = { soglia: 0, rincaro: 1, 'senza-prezzo': 2, 'prezzo-vecchio': 3 };
  return out.sort((x, y) => ordine[x.tipo] - ordine[y.tipo] || (y.valore ?? 0) - (x.valore ?? 0));
}
