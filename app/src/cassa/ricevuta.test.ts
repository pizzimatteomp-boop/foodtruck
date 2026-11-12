import { describe, expect, it } from 'vitest';
import { scontrinoAnnullo, scontrinoVendita } from './archivio';
import { contenutoRicevuta, FRASE, messaggioInvio, nomeFile, testoRicevuta } from './ricevuta';

const v = scontrinoVendita({ idtrx: '1', progressivo: 'DCW2026/9999-7001', pagamento: 'elettronico', ambiente: 'agenzia', cassa: 'C', giorno: '2026-11-10', sumup: 'TX9',
  righe: [{ descrizione: 'Kebab', quantita: 2, centesimi: 1200, aliquota: '10' }, { descrizione: 'Acqua', quantita: 1, centesimi: 150, aliquota: '22' }] });

describe('ricevuta di cortesia', () => {
  it('contenuti: righe, totale, pagamento, documento, data di Roma', () => {
    expect(contenutoRicevuta(v, new Date('2026-11-10T19:05:00Z'))).toEqual({
      titolo: 'Ricevuta', quando: '10/11/2026, 20:05',
      righe: [{ testo: '2 × Kebab', importo: '24,00 €' }, { testo: '1 × Acqua', importo: '1,50 €' }],
      totale: '25,50 €', pagamento: 'Carta · TX9', documento: 'Documento commerciale n. DCW2026/9999-7001',
      nota: 'Il documento commerciale è nel PDF allegato',
    });
    const c = contenutoRicevuta({ ...v, pagamento: 'contanti', ambiente: 'simulatore' }, new Date());
    expect(c.pagamento).toBe('Contanti');
    expect(c.nota).toMatch(/PROVA/);
    const a = contenutoRicevuta(scontrinoAnnullo(v, { idtrx: '2', progressivo: 'P2', cassa: 'C', giorno: '2026-11-10' }), new Date());
    expect(a).toMatchObject({ titolo: 'Annullo', pagamento: '—' });
    expect(contenutoRicevuta({ ...v, sumup: undefined } as never, new Date()).pagamento).toBe('Carta');
  });

  it('messaggio e nomi dei file', () => {
    expect(messaggioInvio(v)).toBe(`VegMan · scontrino DCW2026/9999-7001 · 25,50 €\nIn allegato il documento commerciale (PDF).\n${FRASE}`);
    expect(messaggioInvio({ ...v, tipo: 'A', ambiente: 'simulatore' })).toMatch(/annullo[\s\S]*PROVA/);
    expect(nomeFile(v, 'txt')).toBe('VegMan-DCW2026-9999-7001.txt');
    expect(nomeFile({ progressivo: '/x/' }, 'pdf')).toBe('VegMan-x.pdf');
  });

  it('ricevuta in testo semplice', () => {
    expect(testoRicevuta(v, new Date('2026-11-10T19:05:00Z'))).toBe([
      'VegMan · ricevuta DCW2026/9999-7001', '10/11/2026, 20:05', '',
      '2 × Kebab  24,00 €', '1 × Acqua  1,50 €', '',
      'TOTALE 25,50 €', 'Pagamento: Carta · TX9', '', FRASE,
    ].join('\n'));
    expect(testoRicevuta({ ...v, ambiente: 'simulatore' }, new Date())).toContain('PROVA: non è un documento fiscale.');
  });
});
