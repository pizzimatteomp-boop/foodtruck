/**
 * Carrello della cassa (fase «Cassa», C1), come in Billy: righe dello scontrino, quantità col tasto «×»,
 * righe a importo libero dal tastierino. Importi in centesimi interi: niente errori di arrotondamento.
 */
import type { Aliquota } from '../fiscal/dco';
import type { RigaCassa } from '../fiscal/prova';

export interface Riga {
  /** Prodotto della pagina Prodotti (assente per le righe a importo libero). */
  prodotto?: string;
  descrizione: string;
  quantita: number;
  /** Prezzo unitario IVA inclusa, in centesimi. */
  centesimi: number;
  aliquota: Aliquota;
}

export interface Tastierino {
  /** Cifre digitate (es. «4.50»). */
  testo: string;
  /** Quantità fissata col tasto «×» per la prossima riga. */
  quantita: number | null;
}

export const TASTIERINO_VUOTO: Tastierino = { testo: '', quantita: null };

export class ErroreCassa extends Error {
  override name = 'ErroreCassa';
}

/** Un tasto del tastierino: cifre, «.», «⌫» (cancella), «C» (azzera). */
export function premi(t: Tastierino, tasto: string): Tastierino {
  if (tasto === 'C') return TASTIERINO_VUOTO;
  if (tasto === '⌫') return { ...t, testo: t.testo.slice(0, -1) };
  if (tasto === '.') return t.testo.includes('.') ? t : { ...t, testo: `${t.testo || '0'}.` };
  if (!/^\d$/.test(tasto)) return t;
  const [, dec = ''] = t.testo.split('.');
  if (t.testo.includes('.') && dec.length >= 2) return t; // al massimo i centesimi
  if (t.testo.replace('.', '').length >= 7) return t; // al massimo 99.999,99 €
  return { ...t, testo: t.testo === '0' ? tasto : t.testo + tasto };
}

/** «×»: il numero digitato diventa la quantità della prossima riga (intera, 1–999). */
export function per(t: Tastierino): Tastierino {
  const q = Number(t.testo);
  if (!t.testo || !Number.isInteger(q) || q < 1 || q > 999) throw new ErroreCassa('Per la quantità scrivi un numero intero (es. 3) e poi «×».');
  return { testo: '', quantita: q };
}

/** Importo digitato in centesimi (null se non c'è). */
export function centesimiDa(testo: string): number | null {
  if (!testo || testo === '.' || !/^\d*\.?\d{0,2}$/.test(testo)) return null;
  const [intero = '0', dec = ''] = testo.split('.');
  return Number(intero || '0') * 100 + Number(dec.padEnd(2, '0'));
}

/** Aggiunge un prodotto (con la quantità del «×», altrimenti 1); se è già l'ultima riga, la somma. */
export function aggiungiProdotto(righe: readonly Riga[], p: { id: string; nome: string; prezzo: number; iva?: Aliquota }, quantita = 1): Riga[] {
  const centesimi = Math.round(p.prezzo * 100);
  if (!(centesimi > 0)) throw new ErroreCassa(`«${p.nome}» non ha un prezzo di vendita.`);
  const aliquota = p.iva ?? '10';
  const i = righe.findIndex((r) => r.prodotto === p.id && r.centesimi === centesimi);
  if (i >= 0) return righe.map((r, k) => (k === i ? { ...r, quantita: r.quantita + quantita } : r));
  return [...righe, { prodotto: p.id, descrizione: p.nome, quantita, centesimi, aliquota }];
}

/** Riga a importo libero dal tastierino (es. un prezzo diverso), con descrizione e IVA. */
export function aggiungiLibera(righe: readonly Riga[], t: Tastierino, descrizione: string, aliquota: Aliquota): Riga[] {
  const c = centesimiDa(t.testo);
  if (c === null || c <= 0) throw new ErroreCassa('Scrivi un importo sul tastierino.');
  const d = descrizione.trim() || 'Varie';
  if (d.length > 60) throw new ErroreCassa('Descrizione troppo lunga (massimo 60 caratteri).');
  return [...righe, { descrizione: d, quantita: t.quantita ?? 1, centesimi: c, aliquota }];
}

export function togliUno(righe: readonly Riga[], indice: number): Riga[] {
  return righe.flatMap((r, k) => (k !== indice ? [r] : r.quantita > 1 ? [{ ...r, quantita: r.quantita - 1 }] : []));
}

export function totaleCentesimi(righe: readonly Riga[]): number {
  return righe.reduce((t, r) => t + r.quantita * r.centesimi, 0);
}

export function pezzi(righe: readonly Riga[]): number {
  return righe.reduce((t, r) => t + r.quantita, 0);
}

/** Per l'emissione (prezzi in euro). */
export function righePerScontrino(righe: readonly Riga[]): RigaCassa[] {
  return righe.map((r) => ({ descrizione: r.descrizione, quantita: r.quantita, prezzo: r.centesimi / 100, aliquota: r.aliquota }));
}

/** I 4 preferiti: i prodotti che si vendono di più (quota storica), a parità in ordine di nome. */
export function preferiti<T extends { nome: string; quotaVendite: number }>(prodotti: readonly T[], quanti = 4): T[] {
  return [...prodotti].sort((a, b) => (b.quotaVendite - a.quotaVendite) || a.nome.localeCompare(b.nome, 'it')).slice(0, quanti);
}

const COLORI = ['var(--menta)', 'var(--arancio)', 'var(--crema)', '#D9DCF0', '#F1C6D6'];
/** Colore di un gruppo (sempre lo stesso per lo stesso nome). */
export function coloreGruppo(gruppo: string, gruppi: readonly string[]): string {
  const i = [...new Set(gruppi)].sort((a, b) => a.localeCompare(b, 'it')).indexOf(gruppo);
  return COLORI[(i < 0 ? 0 : i) % COLORI.length]!;
}
