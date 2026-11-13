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

/** Voci da contare scelte dal titolare: null = nessuna scelta (si conta tutto); undefined = in caricamento. */
export function useSceltaInventario(db: Firestore): readonly string[] | null | undefined {
  const [s, setS] = useState<readonly string[] | null | undefined>(undefined);
  useEffect(() => onSnapshot(doc(db, 'impostazioni', 'inventario'), (d) => setS(d.exists() ? (d.data() as { voci: string[] }).voci : null), () => setS(null)), [db]);
  return s;
}

export async function salvaSceltaInventario(db: Firestore, voci: readonly string[]): Promise<void> {
  await setDoc(doc(db, 'impostazioni', 'inventario'), { voci: [...voci] });
}

/** Scorte minime (solo titolare): undefined = in caricamento. */
export function useScorte(db: Firestore): Readonly<Record<string, number>> | undefined {
  const [s, setS] = useState<Readonly<Record<string, number>> | undefined>(undefined);
  useEffect(() => onSnapshot(doc(db, 'impostazioni', 'scorte'), (d) => setS(d.exists() ? (d.data() as { voci: Record<string, number> }).voci : {}), () => setS({})), [db]);
  return s;
}

export async function salvaScorte(db: Firestore, voci: Readonly<Record<string, number>>): Promise<void> {
  await setDoc(doc(db, 'impostazioni', 'scorte'), { voci: { ...voci } });
}
