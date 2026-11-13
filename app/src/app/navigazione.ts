/**
 * Pagine dell'app e chi le vede. L'indirizzo usa il «#» (es. #/persone): funziona anche offline
 * e senza configurare il server. Le regole del database proteggono comunque i dati.
 */
import { puo, type Ruolo } from '../firebase/ruoli';

export type Gruppo = 'Vendite' | 'Menu e costi' | 'Laboratorio e magazzino' | 'Altro';
export const GRUPPI: readonly Gruppo[] = ['Vendite', 'Menu e costi', 'Laboratorio e magazzino', 'Altro'];

export interface Pagina {
  id: 'home' | 'prodotti' | 'ingredienti' | 'fatture' | 'avvisi' | 'pubblica' | 'allergeni' | 'persone' | 'importa' | 'vendi' | 'resoconto' | 'produzione' | 'stazione' | 'inventario' | 'magazzino' | 'eventi' | 'carico';
  titolo: string;
  icona: string;
  /** Una riga per il pannello della Home. */
  descrizione: string;
  /** Nel menu in basso del telefono (le altre si aprono dalla Home). */
  principale: boolean;
  /** Sezione del pannello della Home del titolare. */
  gruppo: Gruppo;
  visibile: (ruolo: Ruolo) => boolean;
}

export const PAGINE: readonly Pagina[] = [
  { id: 'home', titolo: 'Home', icona: '🏠', descrizione: '', principale: true, gruppo: 'Altro', visibile: (r) => r === 'titolare' },
  { id: 'vendi', titolo: 'Cassa', icona: '💶', descrizione: 'Vendi: prodotti, importi liberi, pagamento', principale: true, gruppo: 'Vendite', visibile: (r) => puo(r, 'scontrini') },
  { id: 'prodotti', titolo: 'Prodotti', icona: '🌯', descrizione: 'Ricette, food cost e menu', principale: true, gruppo: 'Menu e costi', visibile: (r) => puo(r, 'acquisti') },
  { id: 'ingredienti', titolo: 'Ingredienti', icona: '🥕', descrizione: 'Prezzi, fonti ed etichette', principale: true, gruppo: 'Menu e costi', visibile: (r) => puo(r, 'acquisti') },
  { id: 'fatture', titolo: 'Fatture', icona: '🧾', descrizione: 'Carica le fatture, controlla le righe nuove', principale: true, gruppo: 'Menu e costi', visibile: (r) => puo(r, 'acquisti') },
  { id: 'avvisi', titolo: 'Avvisi', icona: '🔔', descrizione: 'Soglie, rincari e cose da fare', principale: true, gruppo: 'Menu e costi', visibile: (r) => puo(r, 'acquisti') },
  { id: 'produzione', titolo: 'Produzione', icona: '🏭', descrizione: 'Laboratorio: registra cosa hai fatto e stampa le etichette', principale: false, gruppo: 'Laboratorio e magazzino', visibile: (r) => puo(r, 'produzione') },
  { id: 'carico', titolo: 'Carico', icona: '🚚', descrizione: 'Cosa caricare sul furgone per il prossimo evento', principale: false, gruppo: 'Laboratorio e magazzino', visibile: (r) => puo(r, 'produzione') },
  { id: 'inventario', titolo: 'Inventario', icona: '📦', descrizione: 'Conta ingredienti, packaging e semilavorati', principale: false, gruppo: 'Laboratorio e magazzino', visibile: (r) => puo(r, 'magazzino') },
  { id: 'magazzino', titolo: 'Magazzino', icona: '🏬', descrizione: 'Stock teorico e differenze dell\'inventario', principale: false, gruppo: 'Laboratorio e magazzino', visibile: (r) => puo(r, 'report') },
  { id: 'stazione', titolo: 'Stazione etichette', icona: '🏷', descrizione: 'Da aprire sul computer della stampante: stampa da sola', principale: false, gruppo: 'Laboratorio e magazzino', visibile: (r) => puo(r, 'magazzino') },
  { id: 'eventi', titolo: 'Piano eventi', icona: '📅', descrizione: 'Fatturato previsto, prodotti e piano di carico', principale: false, gruppo: 'Vendite', visibile: (r) => puo(r, 'eventi:modifica') },
  { id: 'resoconto', titolo: 'Resoconto', icona: '📊', descrizione: 'Un evento in numeri: incassi, prodotti, margine', principale: false, gruppo: 'Vendite', visibile: (r) => puo(r, 'report') },
  { id: 'pubblica', titolo: 'Menu e QR', icona: '📱', descrizione: 'Menu pubblico, QR code e cartello da stampare', principale: false, gruppo: 'Menu e costi', visibile: (r) => puo(r, 'acquisti') },
  { id: 'allergeni', titolo: 'Allergeni', icona: '🌾', descrizione: 'Liste ingredienti e tabella allergeni', principale: false, gruppo: 'Menu e costi', visibile: (r) => puo(r, 'acquisti') },
  { id: 'persone', titolo: 'Persone', icona: '👥', descrizione: 'Chi può entrare e con quale ruolo', principale: false, gruppo: 'Altro', visibile: (r) => puo(r, 'utenti') },
  { id: 'importa', titolo: 'Importa', icona: '⬆', descrizione: 'Dati da VegMan Planner', principale: false, gruppo: 'Altro', visibile: (r) => puo(r, 'acquisti') },
];

export function pagineVisibili(ruolo: Ruolo): Pagina[] {
  return PAGINE.filter((p) => p.visibile(ruolo));
}

/**
 * Dall'indirizzo (#/persone) alla pagina; se non esiste o non è permessa, la prima pagina del ruolo:
 * la Home per il titolare, la propria pagina di lavoro per gli altri (es. la Cassa per la cassa).
 */
export function paginaDa(hash: string, ruolo: Ruolo): Pagina {
  const id = hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'home';
  const visibili = pagineVisibili(ruolo);
  return visibili.find((x) => x.id === id) ?? visibili[0] ?? PAGINE[0]!;
}

/** Secondo pezzo dell'indirizzo, es. #/ingredienti/ceci → «ceci»; null se manca. */
export function parametroDa(hash: string): string | null {
  const parti = hash.replace(/^#\/?/, '').split('?')[0]!.split('/');
  return parti[1] ? decodeURIComponent(parti[1]) : null;
}

export function indirizzo(p: Pagina): string {
  return p.id === 'home' ? '#/' : `#/${p.id}`;
}
