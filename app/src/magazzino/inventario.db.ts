/** Confezioni di conta e inventari nel database (regole provate sull'emulatore). */
import { addDoc, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'preact/hooks';
import type { Inventario, UnitaConta } from './inventario';

export function useUnitaConta(db: Firestore): ReadonlyMap<string, UnitaConta> {
  const [m, setM] = useState<ReadonlyMap<string, UnitaConta>>(new Map());
  useEffect(() => onSnapshot(collection(db, 'unitaConta'), (q) => setM(new Map(q.docs.map((d) => [d.id, d.data() as UnitaConta]))), () => setM(new Map())), [db]);
  return m;
}

export async function salvaUnita(db: Firestore, chiave: string, u: UnitaConta): Promise<void> {
  await setDoc(doc(db, 'unitaConta', chiave), u);
}

export async function registraInventario(db: Firestore, uid: string, inv: Inventario): Promise<void> {
  await addDoc(collection(db, 'inventari'), { ...inv, creatoDa: uid, creatoIl: serverTimestamp() });
}

export type InventarioSalvato = Inventario & { id: string; creatoIl?: { toDate?: () => Date } };
export function useInventari(db: Firestore, quanti = 10): { dati: InventarioSalvato[]; caricato: boolean } {
  const [s, setS] = useState<{ dati: InventarioSalvato[]; caricato: boolean }>({ dati: [], caricato: false });
  useEffect(() => onSnapshot(query(collection(db, 'inventari'), orderBy('creatoIl', 'desc'), limit(quanti)),
    (q) => setS({ dati: q.docs.map((d) => ({ ...(d.data() as Inventario), id: d.id })), caricato: true }),
    () => setS((x) => ({ ...x, caricato: true }))), [db, quanti]);
  return s;
}
