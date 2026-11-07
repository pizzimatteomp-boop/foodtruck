/** Menu pubblico nel database: /menu/pubblico, leggibile da tutti, scritto solo dal titolare. */
import { doc, onSnapshot, serverTimestamp, setDoc, type Firestore, type Timestamp } from 'firebase/firestore';
import { useEffect, useState } from 'preact/hooks';
import type { VoceMenu } from './menu';

export interface MenuPubblicato { voci: VoceMenu[]; aggiornatoIl: Timestamp | null; aggiornatoDa: string }

export function pubblicaMenu(db: Firestore, voci: VoceMenu[], uid: string): Promise<void> {
  return setDoc(doc(db, 'menu', 'pubblico'), { voci, aggiornatoIl: serverTimestamp(), aggiornatoDa: uid });
}

export function useMenuPubblicato(db: Firestore): { menu: MenuPubblicato | null; caricato: boolean; errore: boolean } {
  const [s, setS] = useState<{ menu: MenuPubblicato | null; caricato: boolean; errore: boolean }>({ menu: null, caricato: false, errore: false });
  useEffect(() => onSnapshot(doc(db, 'menu', 'pubblico'),
    (d) => setS({ menu: d.exists() ? (d.data() as MenuPubblicato) : null, caricato: true, errore: false }),
    () => setS({ menu: null, caricato: true, errore: true })), [db]);
  return s;
}
