/** Eventi nel database (scrive solo il titolare: regole provate sull'emulatore). */
import { addDoc, collection, type Firestore } from 'firebase/firestore';
import type { Evento } from './eventi';

export async function creaEvento(db: Firestore, e: Omit<Evento, 'id'>): Promise<string> {
  return (await addDoc(collection(db, 'eventi'), e)).id;
}
