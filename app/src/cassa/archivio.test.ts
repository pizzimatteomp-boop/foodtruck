import { describe, expect, it } from 'vitest';
import { descriviPagamento, eOmaggio, idScontrino, nomeCassa, riepilogo, scontrinoAnnullo, scontrinoVendita, SENZA_EVENTO } from './archivio';
import type { Riga } from './carrello';

const RIGHE: Riga[] = [
  { prodotto: 'k', descrizione: 'Kebab', quantita: 2, centesimi: 1200, aliquota: '10' },
  { descrizione: 'Varie', quantita: 1, centesimi: 450, aliquota: '22' },
];

describe('archivio scontrini', () => {
  it('vendita: totale esatto, righe in euro, id = ambiente-idtrx', () => {
    const s = scontrinoVendita({ idtrx: '1', progressivo: 'P1', righe: RIGHE, pagamento: 'elettronico', ambiente: 'simulatore', cassa: 'Cassa 1', giorno: '2026-11-10', sumup: 'TX9' });
    expect(s).toEqual({
      tipo: 'V', idtrx: '1', progressivo: 'P1', evento: SENZA_EVENTO, totale: 28.5, ambiente: 'simulatore', cassa: 'Cassa 1',
      pagamento: 'elettronico', giorno: '2026-11-10', sumup: 'TX9',
      righe: [{ descrizione: 'Kebab', quantita: 2, prezzo: 12, aliquota: '10', prodotto: 'k' }, { descrizione: 'Varie', quantita: 1, prezzo: 4.5, aliquota: '22' }],
    });
    expect(idScontrino(s)).toBe('simulatore-1');
    expect(scontrinoVendita({ idtrx: '2', progressivo: 'P2', righe: RIGHE, pagamento: 'contanti', ambiente: 'agenzia', cassa: 'C', giorno: '2026-11-10', evento: 'ev1' })).not.toHaveProperty('sumup');
  });

  it('annullo: cita l\'originale, stesso importo, nessun pagamento', () => {
    const v = scontrinoVendita({ idtrx: '1', progressivo: 'P1', righe: RIGHE, pagamento: 'contanti', ambiente: 'simulatore', cassa: 'Cassa 1', giorno: '2026-11-10' });
    const a = scontrinoAnnullo(v, { idtrx: '2', progressivo: 'P2', cassa: 'Cassa 2', giorno: '2026-11-10' });
    expect(a).toMatchObject({ tipo: 'A', idtrx: '2', totale: 28.5, pagamento: 'nessuno', progressivoOriginale: 'P1', idtrxOriginale: '1', cassa: 'Cassa 2' });
  });

  it('riepilogo del giorno al netto degli annulli, in centesimi esatti', () => {
    const v = (id: string, pagamento: 'contanti' | 'elettronico', centesimi: number) =>
      scontrinoVendita({ idtrx: id, progressivo: `P${id}`, righe: [{ descrizione: 'x', quantita: 1, centesimi, aliquota: '10' }], pagamento, ambiente: 'simulatore', cassa: 'C', giorno: '2026-11-10' });
    const a = v('1', 'contanti', 10);
    const docs = [a, v('2', 'contanti', 20), v('3', 'elettronico', 1650), scontrinoAnnullo(a, { idtrx: '4', progressivo: 'P4', cassa: 'C', giorno: '2026-11-10' })];
    const r = riepilogo(docs);
    expect({ ...r, annullatiIdtrx: [...r.annullatiIdtrx] }).toEqual({ vendite: 2, annullati: 1, annullatiIdtrx: ['1'], contanti: 0.2, elettronico: 16.5, totale: 16.7, nonRiscosso: 0, omaggi: 0, valoreOmaggi: 0 });
    expect(riepilogo([{ ...v('5', 'contanti', 100), pagamento: 'nessuno' }]).totale).toBe(0);
  });

  it('omaggio (0 €, righe segnate) e non riscosso (fuori dall\'incassato) con il motivo', () => {
    const base = { progressivo: 'P', righe: RIGHE, ambiente: 'simulatore' as const, cassa: 'C', giorno: '2026-11-10' };
    const o = scontrinoVendita({ ...base, idtrx: '1', pagamento: 'omaggio', motivo: '  Fornitore Rossi ' });
    expect(o).toMatchObject({ totale: 0, pagamento: 'nessuno', motivo: 'Fornitore Rossi' });
    expect(o.righe.every((r) => r.omaggio)).toBe(true);
    expect(eOmaggio(o)).toBe(true);
    expect(descriviPagamento(o)).toBe('Omaggio');
    const f = scontrinoVendita({ ...base, idtrx: '2', pagamento: 'fattura', motivo: 'Organizzatore' });
    expect(f).toMatchObject({ totale: 28.5, pagamento: 'non_riscosso', nonRiscosso: 'fattura' });
    expect(descriviPagamento(f)).toMatch(/fattura/);
    const c = scontrinoVendita({ ...base, idtrx: '3', pagamento: 'credito', motivo: 'Pro loco' });
    expect(descriviPagamento(c)).toMatch(/da pagare/);
    expect(scontrinoVendita({ ...base, idtrx: '4', pagamento: 'contanti', motivo: '  ' })).not.toHaveProperty('motivo');
    expect(descriviPagamento(scontrinoAnnullo(f, { idtrx: '9', progressivo: 'P9', cassa: 'C', giorno: '2026-11-10' }))).toBe('—');
    const r = riepilogo([o, f, c, scontrinoVendita({ ...base, idtrx: '5', pagamento: 'contanti' })]);
    expect(r).toMatchObject({ vendite: 4, totale: 28.5, contanti: 28.5, nonRiscosso: 57, omaggi: 1, valoreOmaggi: 28.5 });
  });

  it('nome della cassa', () => {
    expect(nomeCassa(null)).toBe('Cassa 1');
    expect(nomeCassa('  ')).toBe('Cassa 1');
    expect(nomeCassa(' Furgone ')).toBe('Furgone');
    expect(nomeCassa('x'.repeat(40))).toHaveLength(30);
  });
});
