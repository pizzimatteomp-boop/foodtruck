/**
 * Stock teorico del magazzino (passo M3) e confronto con l'inventario. Per ogni voce (ingrediente,
 * packaging, semilavorato): ultimo inventario + entrate − uscite da allora.
 * - Entrate: acquisti (fatture e a mano) collegati a un ingrediente, alle 12 del giorno della fattura
 *   (se l'inventario è dello stesso giorno ma più tardi, la merce si considera già contata);
 *   produzioni del laboratorio (+ semilavorato).
 * - Uscite: ingredienti usati nelle produzioni; vendite della cassa (scontrini non annullati) e movimenti
 *   senza incasso, scomposti con la ricetta: gli ingredienti escono come tali, i semilavorati come
 *   semilavorati (i loro ingredienti sono già usciti quando sono stati prodotti).
 * Modulo puro e testato. Le quantità sono nell'unità di base di ogni voce.
 */
import type { Acquisto, Articolo, Prodotto } from '../foodcost/modello';
import { chiave, type VoceMagazzino } from './inventario';

export interface Evento { ms: number; chiave: string; delta: number; causa: 'acquisto' | 'produzione' | 'vendita' | 'senza incasso' }

/** Mezzogiorno a Roma del giorno aaaa-mm-gg (in ms). */
export function mezzogiorno(giorno: string): number {
  return Date.parse(`${giorno}T11:00:00Z`); // 12:00 ora solare di Roma; d'estate 13:00, va bene uguale
}

/** Scompone `quantita` di un prodotto in uscite di ingredienti e semilavorati. */
export function scomponi(id: string, quantita: number, prodotti: ReadonlyMap<string, Prodotto>, inCorso: ReadonlySet<string> = new Set()): Map<string, number> {
  const out = new Map<string, number>();
  const p = prodotti.get(id);
  if (!p || inCorso.has(id)) return out;
  const visti = new Set(inCorso).add(id);
  const resa = p.resa.quantita > 0 ? p.resa.quantita : 1;
  const somma = (k: string, q: number) => out.set(k, (out.get(k) ?? 0) + q);
  for (const r of p.ricetta) {
    if (!r.id || !(r.quantita > 0)) continue;
    const q = (quantita * r.quantita) / resa;
    if (r.tipo === 'ingrediente') somma(chiave('ingrediente', r.id), q);
    else {
      const sotto = prodotti.get(r.id);
      if (sotto?.tipo === 'semilavorato') somma(chiave('semilavorato', r.id), q);
      else for (const [k, v] of scomponi(r.id, q, prodotti, visti)) somma(k, v);
    }
  }
  return out;
}

export interface Dati {
  prodotti: ReadonlyMap<string, Prodotto>;
  articoli: readonly Articolo[];
  acquisti: readonly Acquisto[];
  produzioni: readonly { prodotto: string; quantita: number; ms: number }[];
  /** Righe vendute (scontrini non annullati) e movimenti senza incasso, già filtrati. */
  uscite: readonly { prodotto: string; quantita: number; ms: number; causa: 'vendita' | 'senza incasso' }[];
}

export function eventi(d: Dati): Evento[] {
  const ev: Evento[] = [];
  const art = new Map(d.articoli.map((a) => [a.id, a] as const));
  for (const a of d.acquisti) {
    const x = a.articolo ? art.get(a.articolo) : undefined;
    if (!x?.ingrediente || !(a.quantita > 0)) continue;
    ev.push({ ms: mezzogiorno(a.data), chiave: chiave('ingrediente', x.ingrediente), delta: a.quantita * x.fattore, causa: 'acquisto' });
  }
  for (const p of d.produzioni) {
    ev.push({ ms: p.ms, chiave: chiave('semilavorato', p.prodotto), delta: p.quantita, causa: 'produzione' });
    for (const [k, q] of scomponi(p.prodotto, p.quantita, d.prodotti)) ev.push({ ms: p.ms, chiave: k, delta: -q, causa: 'produzione' });
  }
  for (const u of d.uscite) {
    const p = d.prodotti.get(u.prodotto);
    if (!p) continue;
    const parti = p.tipo === 'semilavorato' ? new Map([[chiave('semilavorato', p.id), u.quantita]]) : scomponi(u.prodotto, u.quantita, d.prodotti);
    for (const [k, q] of parti) ev.push({ ms: u.ms, chiave: k, delta: -q, causa: u.causa });
  }
  return ev.sort((a, b) => a.ms - b.ms);
}

export interface InventarioConOra { ms: number; giorno: string; righe: readonly { tipo: 'ingrediente' | 'semilavorato'; id: string; quantita: number }[] }

export interface Stock {
  chiave: string;
  /** Ultimo inventario della voce (null = mai contata). */
  base: { giorno: string; ms: number; quantita: number } | null;
  entrate: number;
  uscite: number;
  /** null se la voce non è mai stata contata. */
  teorico: number | null;
}

const arrot = (n: number) => Math.round(n * 1000) / 1000;

/** Stock teorico di ogni voce all'istante `adesso`. */
export function stockTeorico(voci: readonly VoceMagazzino[], inventari: readonly InventarioConOra[], ev: readonly Evento[], adesso: number): Stock[] {
  const ordinati = [...inventari].sort((a, b) => a.ms - b.ms);
  return voci.map((v) => {
    let base: Stock['base'] = null;
    for (const inv of ordinati) {
      if (inv.ms > adesso) break;
      const r = inv.righe.find((x) => chiave(x.tipo, x.id) === v.chiave);
      if (r) base = { giorno: inv.giorno, ms: inv.ms, quantita: r.quantita };
    }
    let entrate = 0, uscite = 0;
    for (const e of ev) {
      if (e.chiave !== v.chiave || e.ms > adesso || (base && e.ms <= base.ms)) continue;
      if (e.delta > 0) entrate += e.delta; else uscite -= e.delta;
    }
    return { chiave: v.chiave, base, entrate: arrot(entrate), uscite: arrot(uscite), teorico: base ? arrot(base.quantita + entrate - uscite) : null };
  });
}

export interface Differenza { chiave: string; nome: string; unita: string; atteso: number; contato: number; differenza: number; percentuale: number | null }

/**
 * Confronto di un inventario con quello che ci si aspettava (dall'inventario precedente della voce in poi).
 * Solo le voci contate anche prima: senza un punto di partenza non c'è un atteso.
 */
export function confronto(voci: readonly VoceMagazzino[], inventari: readonly InventarioConOra[], ev: readonly Evento[], inv: InventarioConOra): Differenza[] {
  const precedenti = inventari.filter((x) => x.ms < inv.ms);
  const atteso = new Map(stockTeorico(voci, precedenti, ev, inv.ms - 1).map((s) => [s.chiave, s] as const));
  const out: Differenza[] = [];
  for (const r of inv.righe) {
    const k = chiave(r.tipo, r.id);
    const s = atteso.get(k);
    const v = voci.find((x) => x.chiave === k);
    if (!s || s.teorico === null || !v) continue;
    const differenza = arrot(r.quantita - s.teorico);
    out.push({ chiave: k, nome: v.nome, unita: v.unita, atteso: s.teorico, contato: r.quantita, differenza, percentuale: s.teorico > 0 ? Math.round((differenza / s.teorico) * 1000) / 10 : null });
  }
  return out.sort((a, b) => Math.abs(b.percentuale ?? 100) - Math.abs(a.percentuale ?? 100));
}

/** Avvisi sulle differenze dell'ultimo inventario oltre la soglia % (di base 10%), le più grandi prima. */
export function avvisiInventario(diff: readonly Differenza[], giorno: string, soglia = 10, testoQuantita: (n: number, unita: string) => string = (n, u) => `${n} ${u}`): string[] {
  const data = giorno.split('-').reverse().join('/');
  return diff.filter((d) => d.percentuale !== null && Math.abs(d.percentuale) >= soglia)
    .sort((a, b) => Math.abs(b.percentuale!) - Math.abs(a.percentuale!))
    .map((d) => `Inventario del ${data}: ${d.nome} ${d.differenza > 0 ? '+' : '−'}${testoQuantita(Math.abs(d.differenza), d.unita)} rispetto all'atteso (${d.percentuale! > 0 ? '+' : '−'}${String(Math.abs(d.percentuale!)).replace('.', ',')}%)`);
}
