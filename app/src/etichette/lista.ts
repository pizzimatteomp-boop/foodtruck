/**
 * Lista ingredienti e allergeni di un prodotto, calcolata dalla ricetta (Reg. UE 1169/2011):
 * - ingredienti in ordine di peso decrescente (ml contati come grammi, pezzi con il loro peso);
 * - ingredienti composti con il loro contenuto tra parentesi, semilavorati espansi allo stesso modo;
 * - allergeni in evidenza, riepilogo «contiene» e «può contenere»; il packaging non compare.
 * Modulo puro e testato. I dati dell'etichetta sono inseriti a mano: se mancano, lo segnala.
 */
import type { Ingrediente, Prodotto } from '../foodcost/modello';
import { nomeAllergene, ordinaAllergeni, type Allergene, type Lingua } from './allergeni';

export interface Voce {
  tipo: 'ingrediente' | 'semilavorato';
  id: string;
  nome: { it: string; en: string };
  /** Grammi nel prodotto; null se non calcolabile (pezzo senza peso). */
  peso: number | null;
  /** Composizione dall'etichetta (ingredienti composti). */
  composizione: { it: string; en: string } | null;
  /** Contenuto dei semilavorati. */
  componenti: Voce[];
  /** L'ingrediente stesso è un allergene da evidenziare (ingrediente semplice con allergeni). */
  evidenzia: boolean;
}

export interface ListaIngredienti {
  voci: Voce[];
  allergeni: Allergene[];
  tracce: Allergene[];
  /** Dati mancanti o da controllare, per lingua (in italiano). */
  problemi: { it: string[]; en: string[] };
}

export interface Segmento { testo: string; grassetto: boolean }

const u = (s: string) => s.trim().toLowerCase();
function grammiPerUnita(i: Ingrediente): number | null {
  const x = u(i.unita);
  if (['g', 'gr', 'grammi', 'ml'].includes(x)) return 1;
  if (['kg', 'l', 'lt', 'litri'].includes(x)) return 1000;
  if (x === 'cl') return 10;
  return i.etichetta?.pesoUnitario && i.etichetta.pesoUnitario > 0 ? i.etichetta.pesoUnitario : null;
}

export function listaIngredienti(
  id: string,
  dati: { prodotti: ReadonlyMap<string, Prodotto>; ingredienti: ReadonlyMap<string, Ingrediente> },
): ListaIngredienti {
  const allergeni = new Set<Allergene>(), tracce = new Set<Allergene>();
  const problemi = { it: new Set<string>(), en: new Set<string>() };

  function espandi(prodotto: Prodotto, scala: number, inCorso: ReadonlySet<string>): Voce[] {
    const voci = new Map<string, Voce>();
    const aggiungi = (v: Voce) => {
      const chiave = `${v.tipo}:${v.id}`;
      const c = voci.get(chiave);
      if (!c) { voci.set(chiave, v); return; }
      c.peso = c.peso === null || v.peso === null ? null : c.peso + v.peso;
      if (v.tipo === 'semilavorato') c.componenti = unisci([...c.componenti, ...v.componenti]);
    };
    for (const r of prodotto.ricetta) {
      if (!(r.quantita > 0)) continue;
      if (r.tipo === 'ingrediente') {
        const i = dati.ingredienti.get(r.id);
        if (!i) { problemi.it.add('un ingrediente della ricetta non esiste più'); continue; }
        if (i.categoria === 'packaging') continue;
        const e = i.etichetta;
        if (!e?.controllata) problemi.it.add(`«${i.nome}»: etichetta da controllare`);
        if (e && !e.nomeEn.trim()) problemi.en.add(`«${i.nome}»: manca il nome in inglese`);
        if (e?.composizione.it.trim() && !e.composizione.en.trim()) problemi.en.add(`«${i.nome}»: manca la composizione in inglese`);
        const g = grammiPerUnita(i);
        if (g === null) problemi.it.add(`«${i.nome}»: manca il peso per pezzo`);
        for (const a of e?.allergeni ?? []) allergeni.add(a);
        for (const a of e?.tracce ?? []) tracce.add(a);
        const composizione = e?.composizione.it.trim() ? { it: e.composizione.it.trim(), en: e.composizione.en.trim() } : null;
        aggiungi({
          tipo: 'ingrediente', id: i.id, nome: { it: i.nome, en: e?.nomeEn.trim() || i.nome },
          peso: g === null ? null : r.quantita * g * scala, composizione, componenti: [],
          evidenzia: !composizione && (e?.allergeni.length ?? 0) > 0,
        });
      } else {
        const s = dati.prodotti.get(r.id);
        if (!s) { problemi.it.add('un semilavorato della ricetta non esiste più'); continue; }
        if (inCorso.has(s.id)) continue;
        if (!s.nomeEn?.trim()) problemi.en.add(`«${s.nome}»: manca il nome in inglese`);
        const resa = s.resa.quantita > 0 ? s.resa.quantita : 1;
        const componenti = espandi(s, (r.quantita / resa) * scala, new Set(inCorso).add(s.id));
        const g = ['g', 'gr', 'ml'].includes(u(s.resa.unita)) ? 1 : ['kg', 'l', 'lt'].includes(u(s.resa.unita)) ? 1000 : null;
        const somma = componenti.some((c) => c.peso === null) ? null : componenti.reduce((t, c) => t + c.peso!, 0);
        aggiungi({
          tipo: 'semilavorato', id: s.id, nome: { it: s.nome, en: s.nomeEn?.trim() || s.nome }, peso: g !== null ? r.quantita * g * scala : somma,
          composizione: null, componenti, evidenzia: false,
        });
      }
    }
    return ordina([...voci.values()]);
  }

  const p = dati.prodotti.get(id);
  if (p && !p.nomeEn?.trim()) problemi.en.add(`«${p.nome}»: manca il nome in inglese`);
  const voci = p ? espandi(p, 1, new Set([id])) : [];
  if (!p) problemi.it.add('prodotto non trovato');
  const a = ordinaAllergeni(allergeni);
  return {
    voci,
    allergeni: a,
    tracce: ordinaAllergeni([...tracce].filter((t) => !allergeni.has(t))),
    problemi: { it: [...problemi.it], en: [...problemi.en] },
  };
}

function unisci(voci: Voce[]): Voce[] {
  const m = new Map<string, Voce>();
  for (const v of voci) {
    const k = `${v.tipo}:${v.id}`;
    const c = m.get(k);
    if (!c) m.set(k, { ...v });
    else c.peso = c.peso === null || v.peso === null ? null : c.peso + v.peso;
  }
  return ordina([...m.values()]);
}

/** Peso decrescente; a parità, nome; senza peso in fondo. */
function ordina(voci: Voce[]): Voce[] {
  return voci.sort((a, b) => (b.peso ?? -1) - (a.peso ?? -1) || a.nome.it.localeCompare(b.nome.it, 'it'));
}

/** «acqua, *soia*, sale» → segmenti con gli allergeni in grassetto. */
export function segmentiComposizione(testo: string): Segmento[] {
  return testo.split(/(\*[^*]+\*)/).filter(Boolean)
    .map((t) => (t.startsWith('*') && t.endsWith('*') && t.length > 2 ? { testo: t.slice(1, -1), grassetto: true } : { testo: t.replace(/\*/g, ''), grassetto: false }));
}

/** La lista come testo con grassetti, pronta da mostrare o stampare. */
export function segmentiLista(voci: readonly Voce[], lingua: Lingua): Segmento[] {
  const out: Segmento[] = [];
  voci.forEach((v, i) => {
    if (i > 0) out.push({ testo: ', ', grassetto: false });
    out.push({ testo: v.nome[lingua], grassetto: v.evidenzia });
    if (v.composizione) {
      out.push({ testo: ' (', grassetto: false }, ...segmentiComposizione(v.composizione[lingua] || v.composizione.it), { testo: ')', grassetto: false });
    } else if (v.componenti.length) {
      out.push({ testo: ' (', grassetto: false }, ...segmentiLista(v.componenti, lingua), { testo: ')', grassetto: false });
    }
  });
  // unisce i pezzi vicini con lo stesso stile
  return out.reduce<Segmento[]>((acc, s) => {
    const ult = acc.at(-1);
    if (ult && ult.grassetto === s.grassetto) ult.testo += s.testo;
    else acc.push({ ...s });
    return acc;
  }, []);
}

export function riepilogoAllergeni(l: Pick<ListaIngredienti, 'allergeni' | 'tracce'>, lingua: Lingua): { contiene: string; puoContenere: string } {
  const elenco = (x: Allergene[]) => x.map((a) => nomeAllergene(a, lingua)).join(', ');
  return { contiene: elenco(l.allergeni), puoContenere: elenco(l.tracce) };
}
