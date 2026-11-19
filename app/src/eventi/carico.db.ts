/**
 * Previsioni (solo titolare) e piani di carico (letti da chi prepara il furgone) nel database.
 * Il piano di carico è una copia fatta al momento: il magazziniere non vede fatturato, % né prezzi,
 * e può cambiare solo le spunte «caricato».
 */
import { arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'preact/hooks';
import type { Evento } from './eventi';
import { eventiDiInsieme, idInsieme, type Previsione, type RigaCarico } from './carico';

export interface BasePrevisione { voci: Previsione; scorta: number }
export interface PrevisioneEvento { fatturato: number; scorta: number; voci: Previsione }
export interface Carico { id: string; evento: string; dal: string; al: string; righe: RigaCarico[]; caricate: string[]; inFiera?: string[]; preparato?: { toDate?: () => Date } }

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

/** Riga da salvare: copia semplice, con gli ingredienti (per «Lo faccio in fiera») solo se ci sono. */
const pulita = (r: RigaCarico): RigaCarico => {
  const { ingredienti, ...resto } = r;
  return ingredienti?.length ? { ...resto, ingredienti: ingredienti.map((i) => { const { ingredienti: _x, ...x } = i; return x; }) } : resto;
};

/** «🔥 Lo faccio in fiera» su un semilavorato del carico (condiviso tra i telefoni, come le spunte). */
export async function segnaInFiera(db: Firestore, carico: string, chiave: string, si: boolean): Promise<void> {
  await updateDoc(doc(db, 'carichi', carico), { inFiera: si ? arrayUnion(chiave) : arrayRemove(chiave) });
}

/** Salva (o rifà) il piano di carico: le spunte delle voci ancora presenti restano. */
export async function salvaCarico(db: Firestore, e: Evento, righe: readonly RigaCarico[]): Promise<void> {
  const prima = await getDoc(doc(db, 'carichi', e.id)).catch(() => null);
  const restano = new Set(righe.map((r) => r.chiave));
  const caricate = ((prima?.exists() ? (prima.data() as Carico).caricate : []) ?? []).filter((k) => restano.has(k));
  const inFiera = ((prima?.exists() ? (prima.data() as Carico).inFiera : []) ?? []).filter((k) => restano.has(k));
  await setDoc(doc(db, 'carichi', e.id), { evento: e.nome, dal: e.dal, al: e.al, righe: righe.map(pulita), caricate, inFiera, preparato: serverTimestamp() });
}

/**
 * Carico unico per più eventi: un solo piano (id «insieme-…») con nome «A + B», dal primo all'ultimo giorno.
 * I piani dei singoli eventi inclusi si tolgono, così «Carico» e «Da produrre» non contano due volte.
 */
export async function salvaCaricoInsieme(db: Firestore, eventi: readonly Evento[], righe: readonly RigaCarico[]): Promise<string> {
  const ordinati = [...eventi].sort((a, b) => a.dal.localeCompare(b.dal) || a.nome.localeCompare(b.nome, 'it'));
  const id = idInsieme(ordinati);
  const prima = await getDoc(doc(db, 'carichi', id)).catch(() => null);
  const restano = new Set(righe.map((r) => r.chiave));
  const caricate = ((prima?.exists() ? (prima.data() as Carico).caricate : []) ?? []).filter((k) => restano.has(k));
  const inFiera = ((prima?.exists() ? (prima.data() as Carico).inFiera : []) ?? []).filter((k) => restano.has(k));
  // via i piani dei singoli eventi e gli altri carichi unici che contengono uno di questi eventi
  const dentro = new Set(ordinati.map((e) => e.id));
  const altri = (await getDocs(collection(db, 'carichi'))).docs.map((d) => d.id)
    .filter((x) => x !== id && (eventiDiInsieme(x) ?? []).some((e) => dentro.has(e)));
  const b = writeBatch(db);
  for (const e of ordinati) b.delete(doc(db, 'carichi', e.id));
  for (const x of altri) b.delete(doc(db, 'carichi', x));
  b.set(doc(db, 'carichi', id), {
    evento: ordinati.map((e) => e.nome).join(' + ').slice(0, 300), dal: ordinati[0]!.dal, al: ordinati.reduce((m, e) => (e.al > m ? e.al : m), ordinati[0]!.al),
    righe: righe.map(pulita), caricate, inFiera, preparato: serverTimestamp(),
  });
  await b.commit();
  return id;
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
