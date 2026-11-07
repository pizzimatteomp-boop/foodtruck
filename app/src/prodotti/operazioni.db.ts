/** Scrittura dei prodotti nel database (provata sull'emulatore: tests/regole). */
import { collection, deleteDoc, doc, setDoc, type Firestore } from 'firebase/firestore';
import type { Prodotto } from '../foodcost/modello';

export async function salvaProdotto(db: Firestore, id: string | null, dati: Omit<Prodotto, 'id'>): Promise<string> {
  const ref = id ? doc(db, 'prodotti', id) : doc(collection(db, 'prodotti'));
  await setDoc(ref, dati);
  return ref.id;
}

export function eliminaProdotto(db: Firestore, id: string): Promise<void> {
  return deleteDoc(doc(db, 'prodotti', id));
}
