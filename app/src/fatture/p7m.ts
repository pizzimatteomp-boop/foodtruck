/**
 * Fatture firmate (.xml.p7m, firma CAdES): estrae l'XML contenuto nella busta firmata.
 * La firma non viene verificata (lo fa già il Sistema di Interscambio): serve solo leggere la fattura.
 * Gestisce file binari (DER/BER, anche con il contenuto spezzato in più pezzi) e file in base64.
 */
export class ErroreP7m extends Error {
  override name = 'ErroreP7m';
}

interface Tlv { tag: number; costruito: boolean; inizio: number; fine: number; figli: Tlv[] }

function leggiTlv(b: Uint8Array, pos: number, limite: number, profondita = 0): { nodo: Tlv; dopo: number } {
  if (profondita > 64 || pos + 2 > limite) throw new ErroreP7m('Busta firmata non valida.');
  let p = pos;
  const primo = b[p++]!;
  let tag = primo;
  if ((primo & 0x1f) === 0x1f) { // tag lungo
    tag = 0;
    let c: number;
    do { c = b[p++]!; tag = (tag << 7) | (c & 0x7f); } while (c & 0x80 && p < limite);
  }
  const costruito = (primo & 0x20) !== 0;
  const l = b[p++]!;
  const figli: Tlv[] = [];
  if (l === 0x80) { // lunghezza indefinita: figli fino a 00 00
    if (!costruito) throw new ErroreP7m('Busta firmata non valida.');
    while (p + 1 < limite && !(b[p] === 0 && b[p + 1] === 0)) {
      const r = leggiTlv(b, p, limite, profondita + 1);
      figli.push(r.nodo);
      p = r.dopo;
    }
    return { nodo: { tag, costruito, inizio: pos, fine: p, figli }, dopo: p + 2 };
  }
  let lung = l;
  if (l & 0x80) {
    const n = l & 0x7f;
    if (n > 4) throw new ErroreP7m('Busta firmata non valida.');
    lung = 0;
    for (let i = 0; i < n; i++) lung = lung * 256 + b[p++]!;
  }
  const fine = p + lung;
  if (fine > limite) throw new ErroreP7m('Busta firmata incompleta.');
  if (costruito) {
    let q = p;
    while (q < fine) {
      const r = leggiTlv(b, q, fine, profondita + 1);
      figli.push(r.nodo);
      q = r.dopo;
    }
  }
  return { nodo: { tag, costruito, inizio: p, fine, figli }, dopo: fine };
}

const OCTET_STRING = 0x04;

function contenuto(b: Uint8Array, n: Tlv): Uint8Array {
  if (!n.costruito) return b.subarray(n.inizio, n.fine);
  const parti = n.figli.map((f) => contenuto(b, f));
  const tot = new Uint8Array(parti.reduce((s, x) => s + x.length, 0));
  let o = 0;
  for (const x of parti) { tot.set(x, o); o += x.length; }
  return tot;
}

function* stringhe(n: Tlv): Generator<Tlv> {
  if ((n.tag & 0x1f) === OCTET_STRING && n.tag < 0x40) yield n; // OCTET STRING semplice o costruita
  else for (const f of n.figli) yield* stringhe(f);
}

/** Decodifica i byte di un XML rispettando la codifica dichiarata (UTF-8 se non indicata). */
export function testoXml(byte: Uint8Array): string {
  const inizio = new TextDecoder('latin1').decode(byte.subarray(0, 200));
  const cod = /encoding=["']([\w-]+)["']/i.exec(inizio)?.[1]?.toLowerCase() ?? 'utf-8';
  let testo: string;
  try { testo = new TextDecoder(cod).decode(byte); } catch { testo = new TextDecoder('utf-8').decode(byte); }
  return testo.replace(/^﻿/, '');
}

function base64(testo: string): Uint8Array | null {
  const pulito = testo.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+=*$/.test(pulito)) return null;
  try {
    return Uint8Array.from(atob(pulito), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export function estraiXmlDaP7m(dati: Uint8Array): string {
  let byte = dati;
  if (byte[0] !== 0x30) { // non è binario: forse base64
    const dec = base64(new TextDecoder('latin1').decode(byte));
    if (!dec || dec[0] !== 0x30) throw new ErroreP7m('Il file .p7m non è una busta firmata leggibile.');
    byte = dec;
  }
  let radice: Tlv;
  try { radice = leggiTlv(byte, 0, byte.length).nodo; } catch (e) {
    throw e instanceof ErroreP7m ? e : new ErroreP7m('Busta firmata non valida.');
  }
  for (const s of stringhe(radice)) {
    const c = contenuto(byte, s);
    if (c.length < 20) continue;
    const testo = testoXml(c);
    if (testo.includes('FatturaElettronica')) return testo;
  }
  throw new ErroreP7m('Nella busta firmata non c\'è una fattura elettronica.');
}
