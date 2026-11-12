/**
 * Pagine dell'app e chi le vede. L'indirizzo usa il «#» (es. #/persone): funziona anche offline
 * e senza configurare il server. Le regole del database proteggono comunque i dati.
 */
import { puo, type Ruolo } from '../firebase/ruoli';

export interface Pagina {
  id: 'home' | 'prodotti' | 'ingredienti' | 'fatture' | 'avvisi' | 'pubblica' | 'allergeni' | 'persone' | 'importa' | 'cassa' | 'vendi' | 'resoconto' | 'produzione' | 'stazione' | 'inventario';
  titolo: string;
  icona: string;
  /** Una riga per il pannello della Home. */
  descrizione: string;
  /** Nel menu in basso del telefono (le altre si aprono dalla Home). */
  principale: boolean;
  visibile: (ruolo: Ruolo) => boolean;
}

export const PAGINE: readonly Pagina[] = [
  { id: 'home', titolo: 'Home', icona: '🏠', descrizione: '', principale: true, visibile: () => true },
  { id: 'vendi', titolo: 'Cassa', icona: '💶', descrizione: 'Vendi: prodotti, importi liberi, pagamento', principale: true, visibile: (r) => puo(r, 'scontrini') },
  { id: 'prodotti', titolo: 'Prodotti', icona: '🌯', descrizione: 'Ricette, food cost e menu', principale: true, visibile: (r) => puo(r, 'acquisti') },
  { id: 'ingredienti', titolo: 'Ingredienti', icona: '🥕', descrizione: 'Prezzi, fonti ed etichette', principale: true, visibile: (r) => puo(r, 'acquisti') },
  { id: 'fatture', titolo: 'Fatture', icona: '🧾', descrizione: 'Carica le fatture, controlla le righe nuove', principale: true, visibile: (r) => puo(r, 'acquisti') },
  { id: 'avvisi', titolo: 'Avvisi', icona: '🔔', descrizione: 'Soglie, rincari e cose da fare', principale: true, visibile: (r) => puo(r, 'acquisti') },
  { id: 'produzione', titolo: 'Produzione', icona: '🏭', descrizione: 'Laboratorio: registra cosa hai fatto e stampa le etichette', principale: false, visibile: (r) => puo(r, 'produzione') },
  { id: 'inventario', titolo: 'Inventario', icona: '📦', descrizione: 'Conta ingredienti, packaging e semilavorati', principale: false, visibile: (r) => puo(r, 'magazzino') },
  { id: 'stazione', titolo: 'Stazione etichette', icona: '🏷', descrizione: 'Da aprire sul computer della stampante: stampa da sola', principale: false, visibile: (r) => puo(r, 'magazzino') },
  { id: 'resoconto', titolo: 'Resoconto', icona: '📊', descrizione: 'Un evento in numeri: incassi, prodotti, margine', principale: false, visibile: (r) => puo(r, 'report') },
  { id: 'pubblica', titolo: 'Menu e QR', icona: '📱', descrizione: 'Menu pubblico, QR code e cartello da stampare', principale: false, visibile: (r) => puo(r, 'acquisti') },
  { id: 'allergeni', titolo: 'Allergeni', icona: '🌾', descrizione: 'Liste ingredienti e tabella allergeni', principale: false, visibile: (r) => puo(r, 'acquisti') },
  { id: 'cassa', titolo: 'Cassa · prova', icona: '🧪', descrizione: 'Scontrini sul simulatore e credenziali Fisconline', principale: false, visibile: (r) => puo(r, 'scontrini') },
  { id: 'persone', titolo: 'Persone', icona: '👥', descrizione: 'Chi può entrare e con quale ruolo', principale: false, visibile: (r) => puo(r, 'utenti') },
  { id: 'importa', titolo: 'Importa', icona: '⬆', descrizione: 'Dati da VegMan Planner', principale: false, visibile: (r) => puo(r, 'acquisti') },
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

/** Secondo pezzo dell'indirizzo, es. #/ingredienti/ceci → «ceci»; null se manca. */
export function parametroDa(hash: string): string | null {
  const parti = hash.replace(/^#\/?/, '').split('?')[0]!.split('/');
  return parti[1] ? decodeURIComponent(parti[1]) : null;
}

export function indirizzo(p: Pagina): string {
  return p.id === 'home' ? '#/' : `#/${p.id}`;
}
