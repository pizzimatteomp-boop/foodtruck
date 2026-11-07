/** Scrittura nel database di fatture, acquisti e articoli (provata sull'emulatore: tests/regole). */
import { collection, doc, serverTimestamp, writeBatch, type Firestore } from 'firebase/firestore';
import type { Acquisto, Articolo } from '../foodcost/modello';
import type { PianoFatture } from './piano';

const PER_BLOCCO = 400;
const senzaId = <T extends { id: string }>({ id: _id, ...resto }: T) => resto;

export async function salvaFatture(db: Firestore, p: PianoFatture, uid: string): Promise<void> {
  const scritture: [string, string, object][] = [
    ...p.articoliNuovi.map((a): [string, string, object] => ['articoli', a.id, senzaId(a)]),
    ...p.fatture.map((f): [string, string, object] => ['fatture', f.id, f.dati]),
    ...p.acquisti.map((a): [string, string, object] => ['acquisti', a.id, senzaId(a)]),
  ];
  for (let i = 0; i < scritture.length; i += PER_BLOCCO) {
    const b = writeBatch(db);
    for (const [raccolta, id, dati] of scritture.slice(i, i + PER_BLOCCO)) b.set(doc(db, raccolta, id), dati);
    await b.commit();
  }
  const r = writeBatch(db);
  r.set(doc(collection(db, 'importazioni')), {
    origine: 'fatture', creatoDa: uid, creatoIl: serverTimestamp(),
    conti: { fatture: p.fatture.length, acquisti: p.acquisti.length, articoli: p.articoliNuovi.length, saltate: p.saltate.length },
  });
  await r.commit();
}

export async function salvaAcquistoManuale(db: Firestore, articolo: Articolo, acquisto: Acquisto): Promise<void> {
  const b = writeBatch(db);
  b.set(doc(db, 'articoli', articolo.id), senzaId(articolo));
  b.set(doc(db, 'acquisti', acquisto.id), senzaId(acquisto));
  await b.commit();
}
