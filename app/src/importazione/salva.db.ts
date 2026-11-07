/**
 * Scrive nel database il risultato dell'import da VegMan Planner.
 * Ogni documento usa il codice di Planner: rifare l'import aggiorna, non duplica.
 */
import { collection, doc, serverTimestamp, writeBatch, type Firestore } from 'firebase/firestore';
import type { RisultatoImport } from './planner';

const PER_BLOCCO = 400; // Firestore accetta al massimo 500 scritture per blocco

export async function salvaImportPlanner(db: Firestore, r: RisultatoImport, uid: string): Promise<void> {
  const scritture: [string, { id: string }][] = [
    ...r.ingredienti.map((x) => ['ingredienti', x] as [string, { id: string }]),
    ...r.prodotti.map((x) => ['prodotti', x] as [string, { id: string }]),
    ...r.articoli.map((x) => ['articoli', x] as [string, { id: string }]),
    ...r.acquisti.map((x) => ['acquisti', x] as [string, { id: string }]),
  ];
  for (let i = 0; i < scritture.length; i += PER_BLOCCO) {
    const blocco = writeBatch(db);
    // merge: rifare l'import aggiorna i dati di Planner ma non cancella quelli aggiunti dopo (es. le etichette)
    for (const [raccolta, { id, ...dati }] of scritture.slice(i, i + PER_BLOCCO)) blocco.set(doc(db, raccolta, id), dati, { merge: true });
    await blocco.commit();
  }
  const registro = writeBatch(db);
  registro.set(doc(collection(db, 'importazioni')), {
    origine: 'planner',
    creatoDa: uid,
    creatoIl: serverTimestamp(),
    conti: { ingredienti: r.ingredienti.length, prodotti: r.prodotti.length, articoli: r.articoli.length, acquisti: r.acquisti.length },
    avvisi: r.avvisi,
  });
  await registro.commit();
}
