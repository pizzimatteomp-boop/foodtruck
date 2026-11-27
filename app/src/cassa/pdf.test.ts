import { describe, expect, it } from 'vitest';
import { pdfScontrino, perPdf } from './pdf';

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');

describe('PDF a striscia', () => {
  it('struttura valida: oggetti, xref con le posizioni giuste, fine file', () => {
    const b = pdfScontrino([{ testo: 'TOTALE (prova) 1€ è', grassetto: true, grande: false }, { testo: '', grassetto: false, grande: false }, { testo: 'VEGMAN', grassetto: true, grande: true }], 'Doc');
    const t = latin1(b);
    expect(t.startsWith('%PDF-1.4\n')).toBe(true);
    expect(t.trimEnd().endsWith('%%EOF')).toBe(true);
    const xref = Number(t.match(/startxref\n(\d+)/)![1]);
    expect(t.slice(xref, xref + 4)).toBe('xref');
    const posizioni = [...t.slice(xref).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    expect(posizioni).toHaveLength(7);
    posizioni.forEach((p, i) => expect(t.slice(p, p + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    // parentesi protette, € e è in WinAnsi, riga grande col doppio del corpo
    expect(t).toContain('(TOTALE \\(prova\\) 1\x80 \xe8) Tj');
    expect(t).toContain('/F2 17 Tf');
    const lunghezza = Number(t.match(/<< \/Length (\d+) >>\nstream\n/)![1]);
    const inizio = t.indexOf('stream\n') + 7;
    expect(t.slice(inizio + lunghezza, inizio + lunghezza + 10)).toBe('\nendstream');
    // alta quanto serve: 2 righe normali + 1 grande + margini
    expect(t).toMatch(/MediaBox \[0 0 226\.77 64\]/);
  });

  it('solo caratteri scrivibili', () => {
    expect(perPdf('Kebab 🌯 · 12€ “sì” — ok')).toBe('Kebab  · 12€ “sì” — ok');
  });
});
