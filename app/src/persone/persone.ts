/**
 * Gestione delle persone (solo titolare): abilitare chi ha fatto l'accesso, cambiare ruolo, disattivare.
 * Le regole del database (firestore.rules) impediscono comunque tutto ciò che qui non è previsto.
 */
import { collection, doc, getDocs, setDoc, type Firestore } from 'firebase/firestore';
import { profiloDa, type Profilo } from '../firebase/profilo';
import { eRuolo, type Ruolo } from '../firebase/ruoli';

export class ErrorePersona extends Error {
  override name = 'ErrorePersona';
}

export interface DatiPersona {
  ruolo: Ruolo;
  attivo: boolean;
  nome: string;
  email: string;
}

/** Il codice utente di Firebase: lettere e numeri, di solito 28 caratteri. */
export function codiceValido(codice: string): boolean {
  return /^[A-Za-z0-9]{10,128}$/.test(codice);
}

/** Controlla e ripulisce i dati inseriti dal titolare. */
export function preparaPersona(
  input: { codice: string; nome: string; email?: string; ruolo: string; attivo?: boolean },
  titolareUid: string,
): { uid: string; dati: DatiPersona } {
  const uid = input.codice.trim();
  if (!codiceValido(uid)) throw new ErrorePersona('Codice utente non valido: copialo dalla schermata della persona.');
  const nome = input.nome.trim();
  if (!nome) throw new ErrorePersona('Scrivi il nome della persona.');
  if (nome.length > 80) throw new ErrorePersona('Nome troppo lungo.');
  if (!eRuolo(input.ruolo)) throw new ErrorePersona('Scegli un ruolo.');
  const email = (input.email ?? '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorePersona('Email non valida.');
  const attivo = input.attivo ?? true;
  if (uid === titolareUid && (input.ruolo !== 'titolare' || !attivo)) {
    throw new ErrorePersona('Non puoi toglierti da solo il ruolo di titolare.');
  }
  return { uid, dati: { ruolo: input.ruolo, attivo, nome, email } };
}

const ORDINE: Record<Ruolo, number> = { titolare: 0, cassa: 1, team: 2 };

/** Ordine dell'elenco: prima gli attivi, poi per ruolo, poi per nome. */
export function ordinaPersone(persone: Profilo[]): Profilo[] {
  return [...persone].sort((a, b) =>
    Number(b.attivo) - Number(a.attivo)
    || ORDINE[a.ruolo] - ORDINE[b.ruolo]
    || a.nome.localeCompare(b.nome, 'it'));
}

export async function elencaPersone(db: Firestore): Promise<Profilo[]> {
  const s = await getDocs(collection(db, 'utenti'));
  return ordinaPersone(s.docs.map((d) => profiloDa(d.id, d.data())).filter((p): p is Profilo => p !== null));
}

export async function salvaPersona(db: Firestore, uid: string, dati: DatiPersona): Promise<void> {
  await setDoc(doc(db, 'utenti', uid), dati);
}
