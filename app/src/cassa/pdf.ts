/**
 * PDF a striscia (larga 80 mm, alta quanto serve) del documento per il cliente: si apre ovunque
 * (WhatsApp, email, stampa). Scritto da zero, senza librerie: carattere Courier dei PDF (a larghezza
 * fissa, così le colonne restano allineate) con la codifica WinAnsi (accenti ed «€»). Modulo puro.
 */
import type { RigaImpaginata } from './documento';

export const COLONNE_PDF = 40;
const LARGHEZZA = 226.77; // 80 mm in punti
const MARGINE = 10;
const CORPO = 8.5; // 40 caratteri Courier (0,6 em) = 204 pt
const INTERLINEA = 11;

// WinAnsi: Latin-1 per quasi tutto, più alcuni segni nella zona 0x80–0x9F.
const SPECIALI: Record<string, number> = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97 };

/** Testo con soli caratteri che il PDF sa scrivere (un carattere = un byte); il resto si toglie. */
export function perPdf(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFC')) {
    const c = ch.codePointAt(0)!;
    if (SPECIALI[ch] !== undefined || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff)) out += ch;
  }
  return out;
}

function byte(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = SPECIALI[ch] ?? ch.codePointAt(0)!;
    if (c === 0x28 || c === 0x29 || c === 0x5c) out.push(0x5c); // ( ) \ vanno protetti
    out.push(c <= 0xff ? c : 0x3f);
  }
  return out;
}

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/** PDF di una pagina con le righe già impaginate a COLONNE_PDF caratteri. */
export function pdfScontrino(righe: readonly RigaImpaginata[], titolo = 'Documento commerciale'): Uint8Array {
  const altezza = Math.ceil(MARGINE * 2 + righe.reduce((t, r) => t + (r.grande ? INTERLINEA * 2 : INTERLINEA), 0));
  const flusso: number[] = [];
  let y = altezza - MARGINE;
  for (const r of righe) {
    const corpo = r.grande ? CORPO * 2 : CORPO;
    y -= r.grande ? INTERLINEA * 2 : INTERLINEA;
    if (!r.testo.trim()) continue;
    flusso.push(...ascii(`BT /${r.grassetto ? 'F2' : 'F1'} ${corpo} Tf ${MARGINE} ${(y + 2.5).toFixed(2)} Td (`), ...byte(r.testo), ...ascii(') Tj ET\n'));
  }
  const oggetti: number[][] = [
    ascii('<< /Type /Catalog /Pages 2 0 R >>'),
    ascii('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGHEZZA} ${altezza}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`),
    ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'),
    ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>'),
    [...ascii(`<< /Length ${flusso.length} >>\nstream\n`), ...flusso, ...ascii('\nendstream')],
    [...ascii('<< /Title ('), ...byte(perPdf(titolo)), ...ascii(') /Producer (VegMan) >>')],
  ];
  const out: number[] = ascii('%PDF-1.4\n%');
  out.push(0xe2, 0xe3, 0xcf, 0xd3, 0x0a); // segnala che il file contiene byte non ASCII
  const posizioni: number[] = [];
  oggetti.forEach((o, i) => { posizioni.push(out.length); out.push(...ascii(`${i + 1} 0 obj\n`), ...o, ...ascii('\nendobj\n')); });
  const xref = out.length;
  out.push(...ascii(`xref\n0 ${oggetti.length + 1}\n0000000000 65535 f \n`));
  for (const p of posizioni) out.push(...ascii(`${String(p).padStart(10, '0')} 00000 n \n`));
  out.push(...ascii(`trailer\n<< /Size ${oggetti.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return new Uint8Array(out);
}
