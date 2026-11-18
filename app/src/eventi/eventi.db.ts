/** Eventi nel database (scrive solo il titolare: regole provate sull'emulatore). */
import { addDoc, collection, doc, getDocs, limit, query, setDoc, where, writeBatch, type Firestore } from 'firebase/firestore';
import { ErroreEvento, type Evento } from './eventi';

export async function creaEvento(db: Firestore, e: Omit<Evento, 'id'>): Promise<string> {
  return (await addDoc(collection(db, 'eventi'), e)).id;
}

/** Correzione di nome, giorni, luogo o Paese; lo stato (aperto/chiuso) resta quello di prima. */
export async function modificaEvento(db: Firestore, id: string, e: Omit<Evento, 'id'>, stato: Evento['stato']): Promise<void> {
  await setDoc(doc(db, 'eventi', id), { ...e, stato });
}

/** Raccolte che legano un documento all'evento: se ce n'è anche uno solo, l'evento non si cancella. */
const LEGATI: [string, string][] = [['scontrini', 'scontrini'], ['movimenti', 'movimenti senza incasso'], ['quadrature', 'chiusure di cassa']];

/** Cosa impedisce di cancellare l'evento (vuoto = si può). */
export async function legatiAllEvento(db: Firestore, id: string): Promise<string[]> {
  const out: string[] = [];
  for (const [raccolta, nome] of LEGATI) {
    if (!(await getDocs(query(collection(db, raccolta), where('evento', '==', id), limit(1)))).empty) out.push(nome);
  }
  return out;
}

/** Cancella l'evento con la sua previsione e il suo piano di carico, solo se non ha scontrini, movimenti o chiusure. */
export async function eliminaEvento(db: Firestore, id: string): Promise<void> {
  const legati = await legatiAllEvento(db, id);
  if (legati.length) throw new ErroreEvento(`Non si può eliminare: l'evento ha già ${legati.join(', ')}. Puoi correggerne nome e date.`);
  const b = writeBatch(db);
  b.delete(doc(db, 'previsioni', id));
  b.delete(doc(db, 'carichi', id));
  b.delete(doc(db, 'eventi', id));
  await b.commit();
}
