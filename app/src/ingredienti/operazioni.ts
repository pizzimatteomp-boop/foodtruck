/**
 * Modifiche a ingredienti e collegamenti con gli articoli dei fornitori (solo titolare).
 * Parte pura e testata: controlli e piano delle modifiche. La scrittura nel database è in operazioni.db.ts.
 */
import type { Articolo, CategoriaIngrediente, Ingrediente, Prodotto } from '../foodcost/modello';

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

