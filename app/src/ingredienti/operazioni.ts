/**
 * Modifiche a ingredienti e collegamenti con gli articoli dei fornitori (solo titolare).
 * Parte pura e testata: controlli e piano delle modifiche. La scrittura nel database è in operazioni.db.ts.
 */
import { eAllergene, ordinaAllergeni } from '../etichette/allergeni';
import type { Articolo, CategoriaIngrediente, Etichetta, Ingrediente, Prodotto } from '../foodcost/modello';

export class ErroreIngrediente extends Error {
  override name = 'ErroreIngrediente';
}

export const CATEGORIE: readonly CategoriaIngrediente[] = ['alimentare', 'packaging'];

export function preparaIngrediente(x: {
  nome: string; categoria: string; unita: string; gruppo?: string; confezione?: number | string | null;
}): Omit<Ingrediente, 'id'> {
  const nome = x.nome.trim();
  if (!nome) throw new ErroreIngrediente('Scrivi il nome dell\'ingrediente.');
  if (nome.length > 80) throw new ErroreIngrediente('Nome troppo lungo.');
  if (!(CATEGORIE as readonly string[]).includes(x.categoria)) throw new ErroreIngrediente('Scegli alimentare o packaging.');
  const unita = x.unita.trim();
  if (!unita || unita.length > 10) throw new ErroreIngrediente('Scrivi l\'unità (g, ml, pz…).');
  const c = x.confezione === null || x.confezione === undefined || x.confezione === '' ? null : Number(String(x.confezione).replace(',', '.'));
  if (c !== null && !(c > 0)) throw new ErroreIngrediente('La confezione deve essere un numero maggiore di zero.');
  return { nome, categoria: x.categoria as CategoriaIngrediente, unita, gruppo: (x.gruppo ?? '').trim().slice(0, 40), confezione: c };
}

export function preparaFattore(v: number | string): number {
  const n = Number(String(v).replace(',', '.'));
  if (!(n > 0) || !Number.isFinite(n)) throw new ErroreIngrediente('La conversione deve essere un numero maggiore di zero.');
  return n;
}

/** Cosa cambia unendo l'ingrediente «da» in «verso»: articoli spostati, ricette aggiornate, «da» cancellato. */
export function pianoUnione(da: string, verso: string, prodotti: readonly Prodotto[], articoli: readonly Articolo[]) {
  if (da === verso) throw new ErroreIngrediente('Scegli un ingrediente diverso.');
  return {
    articoli: articoli.filter((a) => a.ingrediente === da).map((a) => a.id),
    prodotti: prodotti.filter((p) => p.ricetta.some((r) => r.tipo === 'ingrediente' && r.id === da)).map((p) => ({
      id: p.id,
      ricetta: p.ricetta.map((r) => (r.tipo === 'ingrediente' && r.id === da ? { ...r, id: verso } : r)),
    })),
  };
}


/** Dati dell'etichetta inseriti a mano: ripuliti e controllati. */
export function preparaEtichetta(x: {
  nomeEn: string; composizioneIt: string; composizioneEn: string; allergeni: string[]; tracce: string[];
  pesoUnitario: string | number | null; controllata: boolean;
}, unita: string): Etichetta {
  const pulisci = (t: string) => t.replace(/\s+/g, ' ').trim();
  if (x.composizioneIt.length > 1000 || x.composizioneEn.length > 1000) throw new ErroreIngrediente('Composizione troppo lunga.');
  if ((x.composizioneIt.match(/\*/g)?.length ?? 0) % 2 || (x.composizioneEn.match(/\*/g)?.length ?? 0) % 2) {
    throw new ErroreIngrediente('Asterischi spaiati: ogni allergene va tra due asterischi, es. *soia*.');
  }
  const p = x.pesoUnitario === null || x.pesoUnitario === '' ? null : Number(String(x.pesoUnitario).replace(',', '.'));
  if (p !== null && !(p > 0)) throw new ErroreIngrediente('Il peso per pezzo deve essere un numero maggiore di zero.');
  const contaPezzi = !['g', 'gr', 'kg', 'ml', 'cl', 'l', 'lt'].includes(unita.trim().toLowerCase());
  if (contaPezzi && p === null && x.controllata) throw new ErroreIngrediente(`Scrivi quanti grammi pesa 1 ${unita || 'pezzo'}: serve per l'ordine della lista ingredienti.`);
  const allergeni = ordinaAllergeni(x.allergeni.filter(eAllergene));
  return {
    nomeEn: pulisci(x.nomeEn).slice(0, 80),
    composizione: { it: pulisci(x.composizioneIt), en: pulisci(x.composizioneEn) },
    allergeni,
    tracce: ordinaAllergeni(x.tracce.filter(eAllergene).filter((t) => !allergeni.includes(t))),
    pesoUnitario: contaPezzi ? p : null,
    controllata: x.controllata,
  };
}
