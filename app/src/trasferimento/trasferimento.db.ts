/** Lettura (dalla prova) e scrittura (nella definitiva) dei dati del passaggio. Provato sull'emulatore (tests/browser). */
import { collection, doc, getDoc, getDocs, serverTimestamp, Timestamp, writeBatch, type Firestore } from 'firebase/firestore';
import { DOCUMENTI, ORA_SERVER, RACCOLTE, type Doc, type Scrittura } from './trasferimento';

export async function leggiPerPassaggio(db: Firestore): Promise<{ raccolte: Record<string, Doc[]>; eventi: Doc[]; previsioni: Doc[] }> {
  const tutti = async (nome: string) => (await getDocs(collection(db, nome))).docs.map((d) => ({ ...d.data(), id: d.id }) as Doc);
  const raccolte: Record<string, Doc[]> = {};
  for (const r of RACCOLTE) raccolte[r] = await tutti(r);
  for (const percorso of DOCUMENTI) {
    const [r, id] = percorso.split('/') as [string, string];
    const d = await getDoc(doc(db, r, id));
    if (d.exists()) (raccolte[r] ??= []).push({ ...d.data(), id });
  }
  return { raccolte, eventi: await tutti('eventi'), previsioni: await tutti('previsioni') };
}

/** Fatture e storico già nella definitiva (non si possono riscrivere). */
export async function giaPresenti(db: Firestore): Promise<Set<string>> {
  const s = new Set<string>();
  for (const r of ['fatture', 'storico']) for (const d of (await getDocs(collection(db, r))).docs) s.add(`${r}/${d.id}`);
  return s;
}

export const data = (ms: number) => Timestamp.fromMillis(ms);

/** Blocchi di scritture: al massimo 400 documenti e circa 4 MB ciascuno (Firestore accetta fino a ~10 MB per blocco). */
export function blocchi<T extends { dati: unknown }>(s: readonly T[], maxDoc = 400, maxByte = 4_000_000): T[][] {
  const out: T[][] = [];
  let corrente: T[] = [];
  let peso = 0;
  for (const x of s) {
    const p = JSON.stringify(x.dati).length;
    if (corrente.length && (corrente.length >= maxDoc || peso + p > maxByte)) { out.push(corrente); corrente = []; peso = 0; }
    corrente.push(x); peso += p;
  }
  if (corrente.length) out.push(corrente);
  return out;
}

/** Scrive a blocchi; «ora del server» al posto del segnaposto. Restituisce quante scritture. */
export async function scriviPassaggio(db: Firestore, s: readonly Scrittura[], avanzamento?: (fatte: number) => void): Promise<number> {
  let fatte = 0;
  for (const blocco of blocchi(s)) {
    const b = writeBatch(db);
    for (const x of blocco) {
      const dati = Object.fromEntries(Object.entries(x.dati).map(([k, v]) => [k, v === ORA_SERVER ? serverTimestamp() : v]));
      const [r, ...id] = x.percorso.split('/');
      b.set(doc(db, r!, id.join('/')), dati);
    }
    await b.commit();
    fatte += blocco.length;
    avanzamento?.(fatte);
  }
  return s.length;
}
