/**
 * Modifiche a ingredienti e collegamenti con gli articoli dei fornitori (solo titolare).
 * La parte che decide cosa cambiare è pura e testata; le funzioni con «db» la scrivono nel database.
 */
import { collection, doc, writeBatch, type Firestore } from 'firebase/firestore';
import type { Articolo, CategoriaArticolo, CategoriaIngrediente, Ingrediente, Prodotto } from '../foodcost/modello';

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

const senzaId = <T extends { id: string }>({ id: _id, ...resto }: T) => resto;

export async function salvaIngrediente(db: Firestore, id: string | null, dati: Omit<Ingrediente, 'id'>): Promise<string> {
  const ref = id ? doc(db, 'ingredienti', id) : doc(collection(db, 'ingredienti'));
  const b = writeBatch(db);
  b.set(ref, dati);
  await b.commit();
  return ref.id;
}

export async function collegaArticolo(db: Firestore, articolo: Articolo, ingrediente: string | null, fattore: number, categoria: CategoriaArticolo | null) {
  const b = writeBatch(db);
  b.set(doc(db, 'articoli', articolo.id), { ...senzaId(articolo), ingrediente, fattore, categoria });
  await b.commit();
}

export async function unisciIngredienti(db: Firestore, da: string, verso: string, prodotti: readonly Prodotto[], articoli: readonly Articolo[]) {
  const piano = pianoUnione(da, verso, prodotti, articoli);
  const b = writeBatch(db);
  for (const id of piano.articoli) {
    const a = articoli.find((x) => x.id === id)!;
    b.set(doc(db, 'articoli', id), { ...senzaId(a), ingrediente: verso });
  }
  for (const p of piano.prodotti) {
    const orig = prodotti.find((x) => x.id === p.id)!;
    b.set(doc(db, 'prodotti', p.id), { ...senzaId(orig), ricetta: p.ricetta });
  }
  b.delete(doc(db, 'ingredienti', da));
  await b.commit();
  return piano;
}
