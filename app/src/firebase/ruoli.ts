/**
 * Ruoli e permessi dell'app. Le stesse regole valgono nel database (firestore.rules):
 * qui servono a mostrare o nascondere le funzioni, là a proteggere davvero i dati.
 */
export const RUOLI = ['titolare', 'cassa', 'team'] as const;
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
  | 'utenti';

const PERMESSI: Record<Ruolo, readonly Permesso[]> = {
  titolare: [
    'eventi:leggi', 'eventi:modifica', 'ricette:leggi', 'ricette:modifica', 'acquisti', 'comande',
    'scontrini', 'movimenti:registra', 'quadratura:registra', 'report', 'utenti',
  ],
  cassa: ['eventi:leggi', 'ricette:leggi', 'comande', 'scontrini', 'movimenti:registra', 'quadratura:registra'],
  team: ['eventi:leggi', 'ricette:leggi'],
};

export function eRuolo(v: unknown): v is Ruolo {
  return typeof v === 'string' && (RUOLI as readonly string[]).includes(v);
}

export function puo(ruolo: Ruolo | null | undefined, permesso: Permesso): boolean {
  return ruolo ? PERMESSI[ruolo].includes(permesso) : false;
}
