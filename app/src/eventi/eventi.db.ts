/** Eventi nel database (scrive solo il titolare: regole provate sull'emulatore). */
import { addDoc, collection, deleteDoc, doc, getDocs, query, setDoc, updateDoc, where, writeBatch, type Firestore } from 'firebase/firestore';
import { eventiDiInsieme } from './carico';
import { ErroreEvento, type Evento } from './eventi';

export async function creaEvento(db: Firestore, e: Omit<Evento, 'id'>): Promise<string> {
  return (await addDoc(collection(db, 'eventi'), e)).id;
}

/** Correzione di nome, giorni, luogo o Paese; lo stato (aperto/chiuso) resta quello di prima. */
export async function modificaEvento(db: Firestore, id: string, e: Omit<Evento, 'id'>, stato: Evento['stato']): Promise<void> {
  await setDoc(doc(db, 'eventi', id), { ...e, stato });
}

/** Cosa c'è legato all'evento: scontrini veri (bloccano), scontrini di prova, movimenti senza incasso, chiusure. */
export interface Legati { veri: number; prova: number; movimenti: number; chiusure: number }

export async function legatiAllEvento(db: Firestore, id: string): Promise<Legati> {
  const conta = async (raccolta: string) => (await getDocs(query(collection(db, raccolta), where('evento', '==', id)))).docs;
  const sc = await conta('scontrini');
  return {
    veri: sc.filter((d) => d.data().ambiente !== 'simulatore').length,
    prova: sc.filter((d) => d.data().ambiente === 'simulatore').length,
    movimenti: (await conta('movimenti')).length,
    chiusure: (await conta('quadrature')).length,
  };
}

/** Testo per la conferma: cosa si cancella insieme all'evento. Vuoto se non c'è niente. */
export function testoLegati(l: Legati): string {
  const parti = [
    l.prova ? `${l.prova} scontrini di prova` : '', l.movimenti ? `${l.movimenti} movimenti senza incasso` : '', l.chiusure ? `${l.chiusure} chiusure di cassa` : '',
  ].filter(Boolean);
  return parti.join(', ');
}

/**
 * Cancella l'evento con previsione e piani di carico. Se ha scontrini VERI non si può (archivio fiscale).
 * Se ha solo prove (scontrini del simulatore, movimenti, chiusure): l'evento si segna «eliminando»,
 * poi le prove si cancellano (le regole lo permettono solo così), poi l'evento.
 */
export async function eliminaEvento(db: Firestore, id: string): Promise<void> {
  const l = await legatiAllEvento(db, id);
  if (l.veri) throw new ErroreEvento(`Non si può eliminare: l'evento ha ${l.veri} scontrini veri (trasmessi all'Agenzia). Puoi correggerne nome e date.`);
  const daCancellare: string[] = [];
  if (l.prova || l.movimenti || l.chiusure) {
    await updateDoc(doc(db, 'eventi', id), { stato: 'eliminando' });
    for (const r of ['scontrini', 'movimenti', 'quadrature']) {
      for (const d of (await getDocs(query(collection(db, r), where('evento', '==', id)))).docs) daCancellare.push(`${r}/${d.id}`);
    }
  }
  const carichi = (await getDocs(collection(db, 'carichi'))).docs.map((d) => d.id).filter((x) => (eventiDiInsieme(x) ?? []).includes(id));
  const tutti = [...daCancellare, `previsioni/${id}`, `carichi/${id}`, ...carichi.map((x) => `carichi/${x}`)];
  for (let i = 0; i < tutti.length; i += 400) {
    const b = writeBatch(db);
    for (const p of tutti.slice(i, i + 400)) b.delete(doc(db, p));
    await b.commit();
  }
  await deleteDoc(doc(db, 'eventi', id));
}
