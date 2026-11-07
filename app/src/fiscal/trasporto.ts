/**
 * Come il modulo fiscale parla con l'Agenzia: un «trasporto» che invia richieste HTTP.
 * Nell'app Android è l'HTTP nativo di Capacitor (con i cookie della sessione del portale);
 * nei test e nelle prove è il simulatore. Così la logica è la stessa e si prova senza l'Agenzia vera.
 */
export interface Richiesta {
  metodo: 'GET' | 'POST';
  /** Percorso dopo https://ivaservizi.agenziaentrate.gov.it/ser/api/documenti/v1/ (es. «doc/documenti/»). */
  percorso: string;
  corpo?: unknown;
}

export interface Risposta {
  stato: number;
  /** Content-Type della risposta. */
  tipo: string;
  /** JSON già letto, testo o byte (PDF). */
  corpo: unknown;
  /** Indirizzo finale dopo eventuali rinvii (serve a capire se il portale ha rimandato al login). */
  urlFinale?: string;
}

export interface Trasporto {
  /** Lancia ErroreRete se la richiesta non arriva o la risposta si perde. */
  invia(r: Richiesta): Promise<Risposta>;
}

/** La richiesta non è arrivata o la risposta si è persa: NON si sa se l'Agenzia l'ha eseguita. */
export class ErroreRete extends Error {
  override name = 'ErroreRete';
}
/** Il portale chiede di nuovo l'accesso: la richiesta non è stata eseguita. */
export class SessioneScaduta extends Error {
  override name = 'SessioneScaduta';
  constructor() { super('La sessione con l\'Agenzia è scaduta: serve un nuovo accesso.'); }
}
/** L'Agenzia ha risposto con un errore di contenuto: niente è stato emesso. */
export class RifiutoAgenzia extends Error {
  override name = 'RifiutoAgenzia';
  constructor(readonly errori: Array<{ codice: string; descrizione: string }>) {
    super(`L'Agenzia ha rifiutato il documento: ${errori.map((e) => `${e.descrizione} (${e.codice})`).join('; ')}`);
  }
}
/** Errore del servizio dell'Agenzia (es. 500): come per la rete, non si sa se ha eseguito. */
export class ErroreServizio extends Error {
  override name = 'ErroreServizio';
  constructor(readonly stato: number) { super(`Il servizio dell'Agenzia ha risposto con un errore (${stato}).`); }
}
