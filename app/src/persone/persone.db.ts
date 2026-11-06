/** Lettura e scrittura delle persone nel database (provata sull'emulatore: tests/regole). */
import { collection, doc, getDocs, setDoc, type Firestore } from 'firebase/firestore';
import { profiloDa, type Profilo } from '../firebase/profilo';
import { ordinaPersone, type DatiPersona } from './persone';

export async function elencaPersone(db: Firestore): Promise<Profilo[]> {
  const s = await getDocs(collection(db, 'utenti'));
  return ordinaPersone(s.docs.map((d) => profiloDa(d.id, d.data())).filter((p): p is Profilo => p !== null));
}

export async function salvaPersona(db: Firestore, uid: string, dati: DatiPersona): Promise<void> {
  await setDoc(doc(db, 'utenti', uid), dati);
}
