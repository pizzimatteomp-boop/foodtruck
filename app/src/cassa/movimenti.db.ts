/** Movimenti senza incasso nel database (regole provate sull'emulatore). */
import { collection, doc, onSnapshot, query, serverTimestamp, where, writeBatch, type Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'preact/hooks';
import type { Movimento } from './movimenti';

/** Registra insieme i movimenti (anche senza rete: partono appena torna). Non si modificano più. */
export async function registraMovimenti(db: Firestore, uid: string, m: readonly Movimento[]): Promise<void> {
  const b = writeBatch(db);
  for (const x of m) b.set(doc(collection(db, 'movimenti')), { ...x, creatoDa: uid, creatoIl: serverTimestamp() });
  await b.commit();
}

/** Movimenti di un evento (solo il titolare li legge). */
export function useMovimentiEvento(db: Firestore, evento: string, attivo: boolean): { dati: (Movimento & { id: string })[]; caricato: boolean } {
  const [stato, setStato] = useState<{ dati: (Movimento & { id: string })[]; caricato: boolean }>({ dati: [], caricato: false });
  useEffect(() => {
    if (!attivo) return undefined;
    return onSnapshot(query(collection(db, 'movimenti'), where('evento', '==', evento)),
      (q) => setStato({ dati: q.docs.map((d) => ({ ...(d.data() as Movimento), id: d.id })), caricato: true }),
      () => setStato((s) => ({ ...s, caricato: true })));
  }, [db, evento, attivo]);
  return stato;
}
