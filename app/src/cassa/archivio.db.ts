/** Archivio degli scontrini nel database (provato dalle regole sull'emulatore e dalla prova nel browser). */
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where, type Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'preact/hooks';
import { idScontrino, type ScontrinoArchivio } from './archivio';

/** Registra lo scontrino (anche senza rete: parte appena torna). Non si modifica né si cancella più. */
export async function registraScontrino(db: Firestore, uid: string, s: ScontrinoArchivio): Promise<void> {
  await setDoc(doc(db, 'scontrini', idScontrino(s)), { ...s, creatoDa: uid, creatoIl: serverTimestamp() });
}

/** Scontrini di un giorno (tutte le casse), aggiornati dal vivo. */
export function useScontriniDelGiorno(db: Firestore, giorno: string): { dati: (ScontrinoArchivio & { id: string })[]; caricato: boolean } {
  const [stato, setStato] = useState<{ dati: (ScontrinoArchivio & { id: string })[]; caricato: boolean }>({ dati: [], caricato: false });
  useEffect(() => onSnapshot(query(collection(db, 'scontrini'), where('giorno', '==', giorno)),
    (q) => setStato({ dati: q.docs.map((d) => ({ ...(d.data() as ScontrinoArchivio), id: d.id })), caricato: true }),
    () => setStato((s) => ({ ...s, caricato: true }))), [db, giorno]);
  return stato;
}

/** Scontrini di un evento (tutte le casse, tutti i giorni), aggiornati dal vivo. */
export function useScontriniEvento(db: Firestore, evento: string): { dati: (ScontrinoArchivio & { id: string })[]; caricato: boolean } {
  const [stato, setStato] = useState<{ dati: (ScontrinoArchivio & { id: string })[]; caricato: boolean }>({ dati: [], caricato: false });
  useEffect(() => onSnapshot(query(collection(db, 'scontrini'), where('evento', '==', evento)),
    (q) => setStato({ dati: q.docs.map((d) => ({ ...(d.data() as ScontrinoArchivio), id: d.id })), caricato: true }),
    () => setStato((s) => ({ ...s, caricato: true }))), [db, evento]);
  return stato;
}
