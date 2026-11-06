/** Legge una raccolta del database e resta aggiornata (anche senza rete, dalla copia sul dispositivo). */
import { collection, onSnapshot, type Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'preact/hooks';

export function useRaccolta<T extends { id: string }>(db: Firestore, nome: string): { dati: T[]; caricato: boolean; errore: string } {
  const [stato, setStato] = useState<{ dati: T[]; caricato: boolean; errore: string }>({ dati: [], caricato: false, errore: '' });
  useEffect(() => onSnapshot(
    collection(db, nome),
    (s) => setStato({ dati: s.docs.map((d) => ({ ...(d.data() as Omit<T, 'id'>), id: d.id }) as T), caricato: true, errore: '' }),
    (e) => setStato((p) => ({ ...p, caricato: true, errore: e.code === 'permission-denied' ? 'Non hai accesso a questi dati.' : 'Dati non disponibili.' })),
  ), [db, nome]);
  return stato;
}
