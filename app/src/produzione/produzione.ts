/**
 * Produzione del laboratorio ed etichette (magazzino, passo M1). Da telefono: prodotto, quantità, quante
 * etichette → registrazione con numero di lotto + etichetta in coda, che la «Stazione etichette» (il computer
 * con la stampante) stampa da sola. Etichette a uso interno: prodotto, data di produzione, lotto, quantità,
 * ingredienti con gli allergeni in grassetto, «Contiene» / «Può contenere». Modulo puro e testato.
 */
import type { Prodotto } from '../foodcost/modello';
import { riepilogoAllergeni, segmentiLista, type ListaIngredienti, type Segmento } from '../etichette/lista';

export class ErroreProduzione extends Error {
  override name = 'ErroreProduzione';
}

export interface Produzione {
  prodotto: string;
  nome: string;
  quantita: number;
  unita: string;
  /** Etichette da stampare (0 = nessuna). */
  copie: number;
  lotto: string;
  /** aaaa-mm-gg sul fuso di Roma. */
  giorno: string;
  nota?: string;
}

/** Quello che finisce sull'etichetta (copiato al momento: la ricetta può cambiare dopo). */
export interface ContenutoEtichetta {
  prodotto: string;
  /** gg/mm/aaaa */
  data: string;
  lotto: string;
  quantita: string;
  ingredienti: Segmento[];
  contiene: string;
  puoContenere: string;
  nota?: string;
}

const parti = (quando: Date) => {
  const p = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(quando);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { g: v('day'), m: v('month'), a: v('year'), h: v('hour'), min: v('minute') };
};

export function giornoRoma(quando: Date): string {
  const x = parti(quando);
  return `${x.a}-${x.m}-${x.g}`;
}

/** Lotto leggibile: sigla del prodotto + giorno + ora, es. «MAY-121126-1530». */
export function lotto(nome: string, quando: Date): string {
  const sigla = nome.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3).padEnd(3, 'X');
  const x = parti(quando);
  return `${sigla}-${x.g}${x.m}${x.a.slice(2)}-${x.h}${x.min}`;
}

/** Quantità leggibile: 5600 g → «5,6 kg», 3 pz → «3 pz». */
export function quantitaLeggibile(q: number, unita: string): string {
  const u = unita.trim().toLowerCase();
  const num = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 2 });
  if ((u === 'g' || u === 'gr') && q >= 1000) return `${num(q / 1000)} kg`;
  if (u === 'ml' && q >= 1000) return `${num(q / 1000)} L`;
  return `${num(q)} ${unita.trim()}`;
}

export function preparaProduzione(p: Pick<Prodotto, 'id' | 'nome' | 'resa'>, a: { quantita: string; copie: string; nota?: string }, quando: Date): Produzione {
  const q = Number(a.quantita.trim().replace(',', '.'));
  if (!Number.isFinite(q) || q <= 0 || q > 1_000_000) throw new ErroreProduzione('Scrivi quanto hai prodotto (un numero maggiore di zero).');
  const c = a.copie.trim() === '' ? 0 : Number(a.copie);
  if (!Number.isInteger(c) || c < 0 || c > 50) throw new ErroreProduzione('Etichette: da 0 a 50.');
  const nota = a.nota?.trim().slice(0, 200);
  return {
    prodotto: p.id, nome: p.nome, quantita: q, unita: p.resa.unita || 'pz', copie: c,
    lotto: lotto(p.nome, quando), giorno: giornoRoma(quando), ...(nota ? { nota } : {}),
  };
}

export function contenutoEtichetta(p: Produzione, lista: ListaIngredienti, quando: Date): ContenutoEtichetta {
  const x = parti(quando);
  const r = riepilogoAllergeni(lista, 'it');
  return {
    prodotto: p.nome, data: `${x.g}/${x.m}/${x.a}`, lotto: p.lotto, quantita: quantitaLeggibile(p.quantita, p.unita),
    ingredienti: segmentiLista(lista.voci, 'it'), contiene: r.contiene, puoContenere: r.puoContenere,
    ...(p.nota ? { nota: p.nota } : {}),
  };
}

/** Misura dell'etichetta in mm («100x50», «100 × 50»); nei limiti della stampante. */
export interface Misura { larghezza: number; altezza: number }
export const MISURA_PREDEFINITA: Misura = { larghezza: 100, altezza: 50 };
export function leggiMisura(testo: string | null | undefined): Misura {
  const m = /^\s*(\d{2,3})\s*[x×*]\s*(\d{2,3})\s*$/i.exec(testo ?? '');
  if (!m) return MISURA_PREDEFINITA;
  const larghezza = Number(m[1]), altezza = Number(m[2]);
  if (larghezza < 25 || larghezza > 108 || altezza < 15 || altezza > 300) return MISURA_PREDEFINITA;
  return { larghezza, altezza };
}

/** Grandezza del testo degli ingredienti (mm) perché ci stia: più testo, più piccolo, mai sotto 1,6 mm. */
export function corpoIngredienti(c: Pick<ContenutoEtichetta, 'ingredienti' | 'contiene' | 'puoContenere'>, m: Misura): number {
  const caratteri = c.ingredienti.reduce((t, s) => t + s.testo.length, 0) + c.contiene.length + c.puoContenere.length + 40;
  // spazio per il testo: area senza intestazione, ~0,55 mm² per carattere a 1 mm di corpo
  const area = (m.larghezza - 6) * Math.max(8, m.altezza - 20);
  const corpo = Math.sqrt(area / (caratteri * 0.55));
  return Math.round(Math.min(3, Math.max(1.6, corpo)) * 10) / 10;
}
