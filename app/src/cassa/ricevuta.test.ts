import { describe, expect, it } from 'vitest';
import { scontrinoVendita } from './archivio';
import { FRASE, messaggioInvio, nomeFile } from './ricevuta';

const v = scontrinoVendita({ idtrx: '1', progressivo: 'DCW2026/9999-7001', pagamento: 'elettronico', ambiente: 'agenzia', cassa: 'C', giorno: '2026-11-10', sumup: 'TX9',
  righe: [{ descrizione: 'Kebab', quantita: 2, centesimi: 1200, aliquota: '10' }, { descrizione: 'Acqua', quantita: 1, centesimi: 150, aliquota: '22' }] });

describe('messaggio che accompagna il PDF', () => {
  it('messaggio e nome del file', () => {
    expect(messaggioInvio(v)).toBe(`VegMan · scontrino DCW2026/9999-7001 · 25,50 €\nIn allegato il documento commerciale (PDF).\n${FRASE}`);
    expect(messaggioInvio({ ...v, tipo: 'A', ambiente: 'simulatore' })).toMatch(/annullo[\s\S]*PROVA/);
    expect(nomeFile(v, 'pdf')).toBe('VegMan-DCW2026-9999-7001.pdf');
    expect(nomeFile({ progressivo: '/x/' }, 'pdf')).toBe('VegMan-x.pdf');
  });
});
