/** Profilo della persona collegata, letto da /utenti/{uid}. */
import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { eRuolo, type Ruolo } from './ruoli';

export interface Profilo {
  uid: string;
  ruolo: Ruolo;
  attivo: boolean;
  nome: string;
  email: string;
}

/** Converte i dati del database in un profilo; null se mancano o non sono validi. */
export function profiloDa(uid: string, dati: unknown): Profilo | null {
  if (!dati || typeof dati !== 'object') return null;
  const d = dati as Record<string, unknown>;
  if (!eRuolo(d.ruolo) || typeof d.attivo !== 'boolean') return null;
  return {
    uid,
    ruolo: d.ruolo,
    attivo: d.attivo,
    nome: typeof d.nome === 'string' ? d.nome : '',
    email: typeof d.email === 'string' ? d.email : '',
  };
}

/**
 * Legge il profilo. null = la persona non è (ancora) abilitata dal titolare:
 * l'app mostra il suo codice utente da comunicare al titolare.
 */
export async function leggiProfilo(db: Firestore, uid: string): Promise<Profilo | null> {
  try {
    const s = await getDoc(doc(db, 'utenti', uid));
    return s.exists() ? profiloDa(uid, s.data()) : null;
  } catch (e) {
    // Senza profilo le regole negano anche la lettura del proprio documento.
    if ((e as { code?: string }).code === 'permission-denied') return null;
    throw e;
  }
}
