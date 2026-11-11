/** Chiusure di cassa nel database (le scrive la cassa, le legge solo il titolare). */
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where, type Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'preact/hooks';
import type { Quadratura } from './quadratura';

export async function registraQuadratura(db: Firestore, uid: string, q: Quadratura): Promise<void> {
  await addDoc(collection(db, 'quadrature'), { ...q, creatoDa: uid, creatoIl: serverTimestamp() });
}

/** Chiusure (di un evento o tutte), solo per il titolare. */
export function useQuadrature(db: Firestore, evento?: string): { dati: (Quadratura & { id: string })[]; caricato: boolean } {
  const [stato, setStato] = useState<{ dati: (Quadratura & { id: string })[]; caricato: boolean }>({ dati: [], caricato: false });
  useEffect(() => onSnapshot(evento ? query(collection(db, 'quadrature'), where('evento', '==', evento)) : collection(db, 'quadrature'),
    (q) => setStato({ dati: q.docs.map((d) => ({ ...(d.data() as Quadratura), id: d.id })), caricato: true }),
    () => setStato((s) => ({ ...s, caricato: true }))), [db, evento]);
  return stato;
}

/** Chiude l'evento: nessuna cassa potrà più aprirlo (solo il titolare). */
export async function chiudiEvento(db: Firestore, id: string): Promise<void> {
  await updateDoc(doc(db, 'eventi', id), { stato: 'chiuso' });
}
