/**
 * Calcolo dei prezzi degli ingredienti e del food cost dei prodotti. Modulo puro (niente rete), testato.
 * Aritmetica decimale senza arrotondamenti intermedi: si arrotonda solo per mostrare.
 */
import BigNumber from 'bignumber.js';
import type { Acquisto, Articolo, Ingrediente, Prodotto } from './modello';

const N = BigNumber.clone({ DECIMAL_PLACES: 30, ROUNDING_MODE: BigNumber.ROUND_HALF_UP });
const ZERO = new N(0);

export type StatoPrezzo = 'recente' | 'vecchio' | 'mancante';

export interface PrezzoIngrediente {
  /** Prezzo per unità di ingrediente (es. €/g), oppure null se mancante. */
  prezzo: BigNumber | null;
  stato: StatoPrezzo;
  /** Data dell'acquisto più recente usato. */
  ultimoAcquisto: string | null;
  acquisti: number;
}

export interface OpzioniPrezzo {
  /** Giorni della media (60 da progetto); null = tutti gli acquisti di sempre, come VegMan Planner. */
  finestraGiorni: number | null;
  /** Data di riferimento, aaaa-mm-gg. */
  oggi: string;
}

function giorniPrima(data: string, giorni: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - giorni);
  return d.toISOString().slice(0, 10);
}

/** Media pesata: Σ(quantità × prezzo) / Σ(quantità in unità di ingrediente). */
function mediaPesata(righe: { a: Acquisto; fattore: BigNumber }[]): BigNumber | null {
  let valore = ZERO, quantita = ZERO;
  for (const { a, fattore } of righe) {
    const q = new N(a.quantita || 0);
    valore = valore.plus(q.times(a.prezzoUnitario || 0));
    quantita = quantita.plus(q.times(fattore));
  }
  return quantita.gt(1e-9) ? valore.div(quantita) : null;
}

export function prezzoIngrediente(
  ingrediente: string, articoli: readonly Articolo[], acquisti: readonly Acquisto[], o: OpzioniPrezzo,
): PrezzoIngrediente {
  const fattori = new Map(articoli.filter((x) => x.ingrediente === ingrediente)
    .map((x) => [x.id, new N(x.fattore > 0 ? x.fattore : 1)] as const));
  const tutte = acquisti.filter((a) => a.articolo && fattori.has(a.articolo) && a.data <= o.oggi)
    .map((a) => ({ a, fattore: fattori.get(a.articolo!)! }));
  if (tutte.length === 0) return { prezzo: null, stato: 'mancante', ultimoAcquisto: null, acquisti: 0 };
  const ultimo = tutte.reduce((m, r) => (r.a.data > m ? r.a.data : m), '');

  if (o.finestraGiorni === null) {
    return { prezzo: mediaPesata(tutte), stato: 'recente', ultimoAcquisto: ultimo, acquisti: tutte.length };
  }
  const dal = giorniPrima(o.oggi, o.finestraGiorni);
  const recenti = tutte.filter((r) => r.a.data > dal);
  if (recenti.length > 0) {
    return { prezzo: mediaPesata(recenti), stato: 'recente', ultimoAcquisto: ultimo, acquisti: recenti.length };
  }
  const ultimi = tutte.filter((r) => r.a.data === ultimo);
  return { prezzo: mediaPesata(ultimi), stato: 'vecchio', ultimoAcquisto: ultimo, acquisti: ultimi.length };
}

export interface CostoProdotto {
  /** Costo della ricetta intera (per un vendibile da 1 pz è il costo del pezzo). */
  costo: BigNumber;
  completo: boolean;
  /** Nomi degli ingredienti (o riferimenti) senza prezzo, senza doppioni. */
  mancanti: string[];
}

/**
 * Costo della ricetta intera di un prodotto, espandendo i semilavorati.
 * Stesse regole di VegMan Planner: un semilavorato vale (quantità / resa) × costo della sua ricetta;
 * un ingrediente senza prezzo rende il risultato incompleto; un giro chiuso tra ricette vale 0.
 */
export function costoProdotto(
  id: string,
  dati: { prodotti: ReadonlyMap<string, Prodotto>; ingredienti: ReadonlyMap<string, Ingrediente>; prezzi: ReadonlyMap<string, PrezzoIngrediente> },
  inCorso: ReadonlySet<string> = new Set(),
): CostoProdotto {
  const p = dati.prodotti.get(id);
  if (!p) return { costo: ZERO, completo: false, mancanti: ['(prodotto eliminato)'] };
  if (inCorso.has(id)) return { costo: ZERO, completo: true, mancanti: [] };
  const visti = new Set(inCorso).add(id);
  let costo = ZERO, completo = true;
  const mancanti: string[] = [];
  for (const r of p.ricetta) {
    if (!r.id || !(r.quantita > 0)) continue;
    if (r.tipo === 'prodotto') {
      const sotto = dati.prodotti.get(r.id);
      if (!sotto) { completo = false; mancanti.push('(semilavorato eliminato)'); continue; }
      const c = costoProdotto(r.id, dati, visti);
      const resa = sotto.resa.quantita > 0 ? sotto.resa.quantita : 1;
      costo = costo.plus(new N(r.quantita).div(resa).times(c.costo));
      if (!c.completo) { completo = false; mancanti.push(...c.mancanti); }
    } else {
      const ing = dati.ingredienti.get(r.id);
      if (!ing) { completo = false; mancanti.push('(ingrediente eliminato)'); continue; }
      const prezzo = dati.prezzi.get(r.id)?.prezzo ?? null;
      if (prezzo === null) { completo = false; mancanti.push(ing.nome); continue; }
      costo = costo.plus(new N(r.quantita).times(prezzo));
    }
  }
  return { costo, completo, mancanti: [...new Set(mancanti)] };
}

/** Food cost di tutti i prodotti in un colpo, con i prezzi calcolati una volta sola. */
export function foodCost(
  dati: { ingredienti: readonly Ingrediente[]; prodotti: readonly Prodotto[]; articoli: readonly Articolo[]; acquisti: readonly Acquisto[] },
  o: OpzioniPrezzo,
) {
  const prezzi = new Map(dati.ingredienti.map((i) => [i.id, prezzoIngrediente(i.id, dati.articoli, dati.acquisti, o)] as const));
  const mappe = {
    prodotti: new Map(dati.prodotti.map((p) => [p.id, p] as const)),
    ingredienti: new Map(dati.ingredienti.map((i) => [i.id, i] as const)),
    prezzi,
  };
  const prodotti = new Map(dati.prodotti.map((p) => {
    const c = costoProdotto(p.id, mappe);
    // Costo per unità di resa: per pezzo (vendibili) o per g/ml (semilavorati).
    const costoUnitario = c.costo.div(p.resa.quantita > 0 ? p.resa.quantita : 1);
    const percentuale = p.prezzo > 0 ? costoUnitario.div(p.prezzo).times(100) : null;
    return [p.id, { ...c, costoUnitario, percentuale }] as const;
  }));
  return { prezzi, prodotti };
}
