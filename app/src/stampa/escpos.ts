/**
 * Stampa termica ESC/POS (stampanti Bluetooth da 58 mm, 32 colonne), come in VegMan Planner.
 * Ricevuta di cortesia in bianco e nero (deciso da Matteo il 10/11/2026: fondo bianco, niente fasce
 * piene, marchio sottile) e comanda per la cucina (prodotti grandi, niente prezzi).
 * Modulo puro: produce i byte; il collegamento Bluetooth è in ui/stampanteBluetooth.ts.
 */
import type { ContenutoRicevuta } from '../cassa/ricevuta';

const ESC = 0x1b;
const GS = 0x1d;
export const COLONNE = 32;

/** Molte stampanti economiche non gestiscono l'UTF-8: lettere senza accenti, «€» → «EUR», solo ASCII stampabile. */
export function ascii(s: string): string {
  return s.replace(/€/g, 'EUR').replace(/·/g, '-').replace(/[×]/g, 'x').replace(/[–—]/g, '-').replace(/[’‘]/g, "'").replace(/[«»“”]/g, '"')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E\n]/g, '');
}

/** Testo a sinistra e importo a destra sulla stessa riga (il testo lungo va a capo). */
export function colonne(sinistra: string, destra: string, larghezza = COLONNE): string[] {
  const d = ascii(destra).trim();
  const parole = ascii(sinistra).trim().split(' ');
  const righe: string[] = [];
  let r = '';
  for (const p of parole) {
    if (r && (r + ' ' + p).length > larghezza) { righe.push(r); r = p; } else r = r ? `${r} ${p}` : p;
  }
  righe.push(r);
  const ultima = righe[righe.length - 1]!;
  if (ultima.length + 1 + d.length <= larghezza) righe[righe.length - 1] = ultima + ' '.repeat(larghezza - ultima.length - d.length) + d;
  else righe.push(' '.repeat(Math.max(0, larghezza - d.length)) + d);
  return righe.map((x) => x.slice(0, larghezza));
}

/** Righe di testo spezzate alla larghezza della carta. */
export function aCapo(testo: string, larghezza = COLONNE): string[] {
  return ascii(testo).split('\n').flatMap((riga) => {
    const out: string[] = [];
    let r = '';
    for (const p of riga.split(' ')) {
      if (p.length > larghezza) { if (r) out.push(r); for (let i = 0; i < p.length; i += larghezza) out.push(p.slice(i, i + larghezza)); r = ''; continue; }
      if (r && (r + ' ' + p).length > larghezza) { out.push(r); r = p; } else r = r ? `${r} ${p}` : p;
    }
    if (r || !out.length) out.push(r);
    return out;
  });
}

class Byte {
  readonly b: number[] = [];
  cmd(...x: number[]) { this.b.push(...x); return this; }
  testo(s: string) { this.b.push(...new TextEncoder().encode(ascii(s))); return this.cmd(0x0a); }
  centro() { return this.cmd(ESC, 0x61, 1); }
  sinistra() { return this.cmd(ESC, 0x61, 0); }
  grassetto(on: boolean) { return this.cmd(ESC, 0x45, on ? 1 : 0); }
  /** 0 normale, 1 doppia altezza, 2 doppia larghezza e altezza. */
  dimensione(d: 0 | 1 | 2) { return this.cmd(GS, 0x21, d === 0 ? 0x00 : d === 1 ? 0x01 : 0x11); }
  linea() { return this.testo('-'.repeat(COLONNE)); }
  fine() { return this.cmd(0x0a, 0x0a, 0x0a, 0x0a, GS, 0x56, 0x01); }
  bytes() { return new Uint8Array(this.b); }
}

/** Immagine in bianco e nero (1 = punto nero), riga per riga, per il comando GS v 0. */
export interface Bitmap { larghezza: number; altezza: number; punti: Uint8Array }

/** Comando raster GS v 0: 8 punti per byte, righe allineate al byte. */
export function raster(img: Bitmap): number[] {
  const perRiga = Math.ceil(img.larghezza / 8);
  const dati = new Array<number>(perRiga * img.altezza).fill(0);
  for (let y = 0; y < img.altezza; y++) {
    for (let x = 0; x < img.larghezza; x++) {
      if (img.punti[y * img.larghezza + x]) dati[y * perRiga + (x >> 3)]! |= 0x80 >> (x & 7);
    }
  }
  return [GS, 0x76, 0x30, 0, perRiga & 0xff, perRiga >> 8, img.altezza & 0xff, img.altezza >> 8, ...dati];
}

export const NOTA_CARTA = 'Ricevuta di cortesia. Il documento commerciale (PDF) si riceve su WhatsApp o email.';

/** Ricevuta di cortesia termica: niente fondi neri, marchio come immagine sottile (se c'è) o come scritta. */
export function ricevutaTermica(c: ContenutoRicevuta, logo?: Bitmap): Uint8Array {
  const o = new Byte().cmd(ESC, 0x40).centro();
  if (logo) o.cmd(...raster(logo)).cmd(0x0a);
  o.grassetto(true).dimensione(2).testo('VEGMAN').dimensione(0).grassetto(false)
    .testo('Cibo 100% vegetale').testo(c.quando).sinistra().linea();
  for (const r of c.righe) for (const x of colonne(r.testo, r.importo)) o.testo(x);
  o.linea().grassetto(true).dimensione(1);
  for (const x of colonne('TOTALE', c.totale)) o.testo(x);
  o.dimensione(0).grassetto(false).testo(`Pagamento: ${c.pagamento}`).linea();
  for (const x of aCapo(c.documento)) o.testo(x);
  // Sulla carta non c'è un PDF «allegato»: la stampa è una cortesia, il documento è il PDF dell'Agenzia.
  for (const x of aCapo(c.nota.startsWith('PROVA') ? c.nota : NOTA_CARTA)) o.testo(x);
  o.centro().cmd(0x0a).testo('Grazie! Thank you!').fine();
  return o.bytes();
}

export interface Comanda {
  numero: number;
  cassa: string;
  /** Già nel formato italiano (es. «20:31»). */
  ora: string;
  righe: { quantita: number; descrizione: string }[];
  nota?: string;
}

/** Comanda per la cucina: numero grande, prodotti in doppia altezza, niente prezzi. */
export function comandaTermica(c: Comanda): Uint8Array {
  const o = new Byte().cmd(ESC, 0x40).centro().grassetto(true).dimensione(2).testo(`COMANDA ${c.numero}`)
    .dimensione(0).grassetto(false).testo(`${c.cassa} - ${c.ora}`).sinistra().linea().dimensione(1);
  for (const r of c.righe) for (const x of aCapo(`${r.quantita} x ${r.descrizione}`, COLONNE)) o.testo(x);
  o.dimensione(0).linea();
  if (c.nota) for (const x of aCapo(c.nota)) o.testo(x);
  return o.fine().bytes();
}

/** Byte a pezzi: molti moduli BLE accettano pochi byte per scrittura. */
export function aPezzi(b: Uint8Array, quanti = 180): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < b.length; i += quanti) out.push(b.slice(i, i + quanti));
  return out;
}

/** Servizi BLE delle mini-stampanti più diffuse (stesso elenco di VegMan Planner). */
export const SERVIZI_STAMPANTE = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
];

/** Prima caratteristica scrivibile tra i servizi noti (la stampante non dice quale usa). */
export function caratteristicaScrivibile(servizi: readonly { uuid: string; caratteristiche: readonly { uuid: string; scrive: boolean }[] }[]): { servizio: string; caratteristica: string } | null {
  const noti = servizi.filter((s) => SERVIZI_STAMPANTE.includes(s.uuid.toLowerCase()));
  for (const s of [...noti, ...servizi.filter((x) => !noti.includes(x))]) {
    const c = s.caratteristiche.find((x) => x.scrive);
    if (c) return { servizio: s.uuid, caratteristica: c.uuid };
  }
  return null;
}
