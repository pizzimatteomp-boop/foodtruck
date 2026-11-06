/**
 * Pagine dell'app e chi le vede. L'indirizzo usa il «#» (es. #/persone): funziona anche offline
 * e senza configurare il server. Le regole del database proteggono comunque i dati.
 */
import { puo, type Ruolo } from '../firebase/ruoli';

export interface Pagina {
  id: 'home' | 'persone' | 'importa';
  titolo: string;
  icona: string;
  visibile: (ruolo: Ruolo) => boolean;
}

export const PAGINE: readonly Pagina[] = [
  { id: 'home', titolo: 'Home', icona: '⌂', visibile: () => true },
  { id: 'persone', titolo: 'Persone', icona: '👥', visibile: (r) => puo(r, 'utenti') },
  { id: 'importa', titolo: 'Importa', icona: '⬆', visibile: (r) => puo(r, 'acquisti') },
];

export function pagineVisibili(ruolo: Ruolo): Pagina[] {
  return PAGINE.filter((p) => p.visibile(ruolo));
}

/** Dall'indirizzo (#/persone) alla pagina; se non esiste o non è permessa, la Home. */
export function paginaDa(hash: string, ruolo: Ruolo): Pagina {
  const id = hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'home';
  const p = pagineVisibili(ruolo).find((x) => x.id === id);
  return p ?? PAGINE[0]!;
}

export function indirizzo(p: Pagina): string {
  return p.id === 'home' ? '#/' : `#/${p.id}`;
}
