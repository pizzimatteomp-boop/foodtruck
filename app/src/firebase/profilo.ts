/** Profilo della persona collegata, letto da /utenti/{uid}. */
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

