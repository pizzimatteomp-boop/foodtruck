/** Produzione e coda delle etichette nel database (regole provate sull'emulatore). */
import {
  collection, doc, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, updateDoc, where, writeBatch, type Firestore,
} from 'firebase/firestore';
import { useEffect, useState } from 'preact/hooks';
import type { ContenutoEtichetta, Produzione } from './produzione';

export type StatoEtichetta = 'da_stampare' | 'in_stampa' | 'stampata';
export interface Etichetta { id: string; contenuto: ContenutoEtichetta; copie: number; stato: StatoEtichetta; produzione: string; stazione?: string; creatoIl?: { toMillis?: () => number } }

/** Registra la produzione e mette in coda le sue etichette, insieme (anche senza rete: partono appena torna). */
export async function registraProduzione(db: Firestore, uid: string, p: Produzione, contenuto: ContenutoEtichetta): Promise<string> {
  const b = writeBatch(db);
  const ref = doc(collection(db, 'produzioni'));
  b.set(ref, { ...p, creatoDa: uid, creatoIl: serverTimestamp() });
  if (p.copie > 0) b.set(doc(collection(db, 'etichette')), { contenuto, copie: p.copie, stato: 'da_stampare', produzione: ref.id, creatoDa: uid, creatoIl: serverTimestamp() });
  await b.commit();
  return ref.id;
}

/** Ristampa: una nuova richiesta con lo stesso contenuto. */
export async function ristampa(db: Firestore, uid: string, e: Pick<Etichetta, 'contenuto' | 'produzione'>, copie: number): Promise<void> {
  const b = writeBatch(db);
  b.set(doc(collection(db, 'etichette')), { contenuto: e.contenuto, copie, stato: 'da_stampare', produzione: e.produzione, creatoDa: uid, creatoIl: serverTimestamp() });
  await b.commit();
}

/** Ultime etichette (per il telefono e per la stazione). */
export function useEtichette(db: Firestore, quante = 30): { dati: Etichetta[]; caricato: boolean } {
  const [s, setS] = useState<{ dati: Etichetta[]; caricato: boolean }>({ dati: [], caricato: false });
  useEffect(() => onSnapshot(query(collection(db, 'etichette'), orderBy('creatoIl', 'desc'), limit(quante)),
    (q) => setS({ dati: q.docs.map((d) => ({ ...(d.data() as Omit<Etichetta, 'id'>), id: d.id })), caricato: true }),
    () => setS((x) => ({ ...x, caricato: true }))), [db, quante]);
  return s;
}

/** Coda da stampare (per la stazione), dalla più vecchia. */
export function useCoda(db: Firestore): Etichetta[] {
  const [coda, setCoda] = useState<Etichetta[]>([]);
  useEffect(() => onSnapshot(query(collection(db, 'etichette'), where('stato', '==', 'da_stampare')),
    (q) => setCoda(q.docs.map((d) => ({ ...(d.data() as Omit<Etichetta, 'id'>), id: d.id }))
      .sort((a, b) => (a.creatoIl?.toMillis?.() ?? Infinity) - (b.creatoIl?.toMillis?.() ?? Infinity))),
    () => setCoda([])), [db]);
  return coda;
}

/** La stazione prende un'etichetta (se un'altra stazione l'ha già presa, false). */
export async function prendi(db: Firestore, id: string, stazione: string): Promise<boolean> {
  return runTransaction(db, async (t) => {
    const r = doc(db, 'etichette', id);
    const x = await t.get(r);
    if (!x.exists() || x.data().stato !== 'da_stampare') return false;
    t.update(r, { stato: 'in_stampa', stazione });
    return true;
  });
}

export async function segnaStampata(db: Firestore, id: string): Promise<void> {
  await updateDoc(doc(db, 'etichette', id), { stato: 'stampata', stampataIl: serverTimestamp() });
}

/** Rimette in coda (stampa da rifare, o rimasta «in stampa» per un problema). */
export async function rimettiInCoda(db: Firestore, id: string): Promise<void> {
  await updateDoc(doc(db, 'etichette', id), { stato: 'da_stampare' });
}
