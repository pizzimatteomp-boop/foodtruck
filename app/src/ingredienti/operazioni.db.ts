/** Scrittura nel database di ingredienti e collegamenti (provata sull'emulatore: tests/regole). */
import { collection, doc, writeBatch, type Firestore } from 'firebase/firestore';
import type { Articolo, CategoriaArticolo, Ingrediente, Prodotto } from '../foodcost/modello';
import { pianoUnione } from './operazioni';

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
