/**
 * Ruoli e permessi dell'app. Le stesse regole valgono nel database (firestore.rules):
 * qui servono a mostrare o nascondere le funzioni, là a proteggere davvero i dati.
 */
export const RUOLI = ['titolare', 'cassa', 'magazziniere', 'team'] as const;
export type Ruolo = (typeof RUOLI)[number];

export type Permesso =
  | 'eventi:leggi'
  | 'eventi:modifica'
  | 'ricette:leggi'
  | 'ricette:modifica'
  | 'acquisti'
  | 'comande'
  | 'scontrini'
  | 'movimenti:registra'
  | 'quadratura:registra'
  | 'report'
  | 'utenti'
  /** Registrare la produzione del laboratorio (con le etichette). */
  | 'produzione'
  /** Stazione etichette (computer della stampante) e magazzino. */
  | 'magazzino';

const PERMESSI: Record<Ruolo, readonly Permesso[]> = {
  titolare: [
    'eventi:leggi', 'eventi:modifica', 'ricette:leggi', 'ricette:modifica', 'acquisti', 'comande',
    'scontrini', 'movimenti:registra', 'quadratura:registra', 'report', 'utenti', 'produzione', 'magazzino',
  ],
  cassa: ['eventi:leggi', 'ricette:leggi', 'comande', 'scontrini', 'movimenti:registra', 'quadratura:registra'],
  magazziniere: ['eventi:leggi', 'ricette:leggi', 'produzione', 'magazzino'],
  team: ['eventi:leggi', 'ricette:leggi', 'produzione'],
};

export function eRuolo(v: unknown): v is Ruolo {
  return typeof v === 'string' && (RUOLI as readonly string[]).includes(v);
}

export function puo(ruolo: Ruolo | null | undefined, permesso: Permesso): boolean {
  return ruolo ? PERMESSI[ruolo].includes(permesso) : false;
}

export const NOME_RUOLO: Record<Ruolo, string> = { titolare: 'Titolare', cassa: 'Cassa', magazziniere: 'Magazziniere', team: 'Team' };
