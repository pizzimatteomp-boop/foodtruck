import { describe, expect, it } from 'vitest';
import { scontrinoAnnullo, scontrinoVendita } from './archivio';
import { dataOra, documentoCliente, esercenteDa, impagina, ivaCompresa, type Esercente } from './documento';

const esercente: Esercente = { nome: 'Mario Rossi', indirizzo: 'Via Finta, 1', luogo: '00100 - Roma (RM)', partitaIva: '00000000000' };
const v = scontrinoVendita({ idtrx: '1', progressivo: 'DCW2026/9999-7001', pagamento: 'elettronico', ambiente: 'agenzia', cassa: 'C', giorno: '2026-10-25', sumup: 'TX9',
  righe: [{ descrizione: 'Kebab veg', quantita: 1, centesimi: 1300, aliquota: '10' }, { descrizione: 'Acqua', quantita: 2, centesimi: 150, aliquota: '22' }] });
const quando = new Date('2026-10-25T20:48:07Z');
const testo = (s: Parameters<typeof documentoCliente>[0]) => impagina(documentoCliente(s, quando, esercente), 40).map((r) => r.testo);

describe('documento per il cliente (come Billy)', () => {
  it('intestazione, righe, totale, IVA, pagamento, data, numero, SumUp', () => {
    const t = testo(v);
    expect(t).toEqual(expect.arrayContaining([
      '       VEGMAN', '              Mario Rossi', '              Via Finta, 1', '           00100 - Roma (RM)', '           P.IVA 00000000000',
      '             www.vegman.it', '         DOCUMENTO COMMERCIALE', '        di vendita o prestazione',
      'DESCRIZIONE               IVA%    Prezzo', 'Kebab veg                10.00     13.00',
      'N. 2 x 1.50€', 'Acqua                    22.00      3.00',
      'TOTALE COMPLESSIVO                 16.00',
      'di cui IVA                          1.72', 'Pagamento elettronico              16.00', 'Importo pagato                     16.00',
      '          25-10-2026 21:48:07', '     Documento N.DCW2026/9999-7001', '        Codice transazione: TX9', '           IMPORTO EUR 16.00',
    ]));
    expect(t.join('\n')).not.toContain('PROVA');
    expect(impagina(documentoCliente(v, quando, esercente), 40).every((r) => r.testo.length <= (r.grande ? 20 : 40))).toBe(true);
  });

  it('prova, contanti, annullo', () => {
    const p = testo({ ...v, ambiente: 'simulatore', pagamento: 'contanti' }).join('\n');
    expect(p.match(/PROVA - NON È UN DOCUMENTO FISCALE/g)).toHaveLength(2);
    expect(p).toContain('Pagamento contante');
    expect(p).not.toContain('Codice transazione');
    const a = testo(scontrinoAnnullo(v, { idtrx: '2', progressivo: 'DCW2026/9999-7002', cassa: 'C', giorno: '2026-10-25' })).join('\n');
    expect(a).toContain('emesso per ANNULLAMENTO');
    expect(a).toContain('Documento di riferimento');
    expect(a).toContain('DCW2026/9999-7001');
    expect(a).toContain('TOTALE ANNULLATO');
    expect(a).not.toContain('Importo pagato');
    expect(testo({ ...v, tipo: 'R' }).join('\n')).toContain('RESO MERCE');
  });

  it('IVA scorporata per aliquota, nature senza IVA', () => {
    expect(ivaCompresa([{ descrizione: 'a', quantita: 3, prezzo: 5, aliquota: '10' }, { descrizione: 'b', quantita: 1, prezzo: 2, aliquota: 'N2' }])).toBe(136);
    expect(ivaCompresa([])).toBe(0);
  });

  it('data e ora sul fuso di Roma, esercente dai dati dell\'Agenzia', () => {
    expect(dataOra(new Date('2026-07-01T22:05:09Z'))).toBe('02-07-2026 00:05:09');
    expect(esercenteDa({ partitaIva: '1', codiceFiscale: 'X', nome: 'Mario', cognome: 'Rossi', indirizzo: 'Via Finta', numeroCivico: '3', cap: '00100', comune: 'Roma', provincia: 'RM', nazione: 'IT' }))
      .toEqual({ nome: 'Mario Rossi', indirizzo: 'Via Finta, 3', luogo: '00100 - Roma (RM)', partitaIva: '1' });
    expect(esercenteDa({ partitaIva: '1', codiceFiscale: 'X', denominazione: 'Ditta Srl', indirizzo: 'Via', cap: '1', comune: 'C', provincia: '', nazione: 'IT' }).nome).toBe('Ditta Srl');
  });

  it('impaginazione: parole lunghe spezzate, importo sotto se non ci sta', () => {
    const r = impagina([{ tipo: 'coppia', sinistra: 'x'.repeat(12), destra: '99.00' }, { tipo: 'testo', testo: 'y'.repeat(25) }], 10).map((x) => x.testo);
    expect(r).toEqual(['xxxxxxxxxx', 'xx   99.00', 'yyyyyyyyyy', 'yyyyyyyyyy', 'yyyyy']);
    expect(impagina([{ tipo: 'coppia', sinistra: 'abcdefgh', destra: '99.00' }], 10).map((x) => x.testo)).toEqual(['abcdefgh', '     99.00']);
  });
});
