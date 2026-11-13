/**
 * Previsioni (solo titolare) e piani di carico (letti da chi prepara il furgone) nel database.
 * Il piano di carico è una copia fatta al momento: il magazziniere non vede fatturato, % né prezzi,
 * e può cambiare solo le spunte «caricato».
 */
import { arrayRemove, arrayUnion, collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'preact/hooks';
import type { Evento } from './eventi';
import type { Previsione, RigaCarico } from './carico';

export interface BasePrevisione { voci: Previsione; scorta: number }
export interface PrevisioneEvento { fatturato: number; scorta: number; voci: Previsione }
export interface Carico { id: string; evento: string; dal: string; al: string; righe: RigaCarico[]; caricate: string[]; preparato?: { toDate?: () => Date } }

function useDoc<T>(db: Firestore, percorso: string, segmenti: string[]): T | null | undefined {
  const [d, setD] = useState<T | null | undefined>(undefined);
  const chiave = [percorso, ...segmenti].join('/');
  useEffect(() => {
    if (segmenti.some((s) => !s)) { setD(null); return undefined; }
    setD(undefined);
    return onSnapshot(doc(db, percorso, ...segmenti), (x) => setD(x.exists() ? (x.data() as T) : null), () => setD(null));
  }, [db, chiave]);
  return d;
}

/** Valori di base delle previsioni (null = mai salvati). */
export const useBasePrevisione = (db: Firestore) => useDoc<BasePrevisione>(db, 'impostazioni', ['previsione']);
export async function salvaBasePrevisione(db: Firestore, b: BasePrevisione): Promise<void> {
  await setDoc(doc(db, 'impostazioni', 'previsione'), { voci: { ...b.voci }, scorta: b.scorta });
}

export const usePrevisione = (db: Firestore, evento: string) => useDoc<PrevisioneEvento>(db, 'previsioni', [evento]);
export async function salvaPrevisione(db: Firestore, evento: string, p: PrevisioneEvento): Promise<void> {
  await setDoc(doc(db, 'previsioni', evento), { fatturato: p.fatturato, scorta: p.scorta, voci: { ...p.voci } });
}

/** Salva (o rifà) il piano di carico: le spunte delle voci ancora presenti restano. */
export async function salvaCarico(db: Firestore, e: Evento, righe: readonly RigaCarico[]): Promise<void> {
  const prima = await getDoc(doc(db, 'carichi', e.id)).catch(() => null);
  const restano = new Set(righe.map((r) => r.chiave));
  const caricate = ((prima?.exists() ? (prima.data() as Carico).caricate : []) ?? []).filter((k) => restano.has(k));
  await setDoc(doc(db, 'carichi', e.id), { evento: e.nome, dal: e.dal, al: e.al, righe: righe.map((r) => ({ ...r })), caricate, preparato: serverTimestamp() });
}

export function useCarichi(db: Firestore): { dati: Carico[]; caricato: boolean } {
  const [s, setS] = useState<{ dati: Carico[]; caricato: boolean }>({ dati: [], caricato: false });
  useEffect(() => onSnapshot(collection(db, 'carichi'),
    (q) => setS({ dati: q.docs.map((d) => ({ ...(d.data() as Omit<Carico, 'id'>), id: d.id })), caricato: true }),
    () => setS((x) => ({ ...x, caricato: true }))), [db]);
  return s;
}

export async function segnaCaricata(db: Firestore, evento: string, chiave: string, si: boolean): Promise<void> {
  await updateDoc(doc(db, 'carichi', evento), { caricate: si ? arrayUnion(chiave) : arrayRemove(chiave) });
}

/** Indirizzo del calendario (scheda «App» pubblicata come CSV). */
export const useCalendario = (db: Firestore) => useDoc<{ url: string }>(db, 'impostazioni', ['calendario']);
export async function salvaCalendario(db: Firestore, url: string): Promise<void> {
  await setDoc(doc(db, 'impostazioni', 'calendario'), { url: url.trim() });
}
