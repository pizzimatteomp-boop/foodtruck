/** Fotografie mensili e impostazioni del food cost nel database (provate sull'emulatore: tests/regole). */
import { collection, doc, onSnapshot, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'preact/hooks';
import type { Fotografia } from './storico';

export const SOGLIA_RINCARO_INIZIALE = 10;

/** Salva la fotografia di un mese: una volta sola (il database rifiuta le modifiche). */
export function salvaFotografia(db: Firestore, f: Fotografia, uid: string): Promise<void> {
  return setDoc(doc(db, 'storico', f.mese), { ...f, creatoDa: uid, creatoIl: serverTimestamp() });
}

export function useFotografie(db: Firestore): { fotografie: Map<string, Fotografia>; caricato: boolean } {
  const [s, setS] = useState({ fotografie: new Map<string, Fotografia>(), caricato: false });
  useEffect(() => onSnapshot(collection(db, 'storico'),
    (q) => setS({ fotografie: new Map(q.docs.map((d) => [d.id, d.data() as Fotografia])), caricato: true }),
    () => setS((p) => ({ ...p, caricato: true }))), [db]);
  return s;
}

export function useSogliaRincaro(db: Firestore): number {
  const [v, setV] = useState(SOGLIA_RINCARO_INIZIALE);
  useEffect(() => onSnapshot(doc(db, 'impostazioni', 'foodcost'), (d) => {
    const x = d.data()?.sogliaRincaro;
    setV(typeof x === 'number' && x > 0 ? x : SOGLIA_RINCARO_INIZIALE);
  }, () => undefined), [db]);
  return v;
}

export function salvaSogliaRincaro(db: Firestore, valore: number): Promise<void> {
  return setDoc(doc(db, 'impostazioni', 'foodcost'), { sogliaRincaro: valore });
}
