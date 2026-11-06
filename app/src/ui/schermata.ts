/**
 * Cosa mostrare nella schermata di accesso, in base allo stato. Funzione pura: testata in schermata.test.ts.
 */
import type { Ruolo } from '../firebase/ruoli';

export type StatoSchermata =
  | { stato: 'avvio' }
  | { stato: 'fuori'; errore?: string }
  | { stato: 'non-abilitato'; uid: string; email: string }
  | { stato: 'dentro'; nome: string; email: string; ruolo: Ruolo };

export type Azione = 'accedi' | 'esci' | 'copia-codice';

export interface Vista {
  titolo: string;
  righe: string[];
  /** Testo da mettere in evidenza e copiabile (il codice utente). */
  codice?: string;
  azioni: Azione[];
  errore?: string;
}

const NOME_RUOLO: Record<Ruolo, string> = { titolare: 'Titolare', cassa: 'Cassa', team: 'Team' };

/** Traduce i codici d'errore di Firebase in frasi comprensibili. */
export function messaggioErrore(codice: string): string {
  switch (codice) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Accesso annullato.';
    case 'auth/network-request-failed':
      return 'Nessuna connessione: riprova quando c\'è rete.';
    case 'auth/unauthorized-domain':
      return 'Questo indirizzo non è autorizzato per l\'accesso.';
    case 'auth/operation-not-allowed':
      return 'L\'accesso con Google non è attivo nel progetto.';
    default:
      return `Accesso non riuscito (${codice || 'errore sconosciuto'}).`;
  }
}

export function vista(s: StatoSchermata): Vista {
  switch (s.stato) {
    case 'avvio':
      return { titolo: 'VegMan', righe: ['Caricamento…'], azioni: [] };
    case 'fuori':
      return {
        titolo: 'Benvenuto in VegMan',
        righe: ['Accedi con il tuo account Google.'],
        azioni: ['accedi'],
        ...(s.errore ? { errore: s.errore } : {}),
      };
    case 'non-abilitato':
      return {
        titolo: 'In attesa di abilitazione',
        righe: [
          `Hai fatto l'accesso come ${s.email || 'utente Google'}, ma il titolare non ti ha ancora dato un ruolo.`,
          'Manda al titolare questo codice:',
        ],
        codice: s.uid,
        azioni: ['copia-codice', 'esci'],
      };
    case 'dentro':
      return {
        titolo: `Ciao ${s.nome || s.email}`,
        righe: [`Ruolo: ${NOME_RUOLO[s.ruolo]}`, 'Accesso riuscito. Le prossime funzioni arriveranno qui.'],
        azioni: ['esci'],
      };
  }
}
