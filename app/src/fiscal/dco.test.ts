import { calcolaRiga, dataAgenzia, documentoAnnullo, documentoVendita, ErroreDocumento, leggiEsito, type Cedente } from './dco';

const PASTARE: Cedente = {
  partitaIva: '02948500422', codiceFiscale: 'PZZMTT89E17A944D', nome: 'MATTEO', cognome: 'PIZZI',
  indirizzo: 'VIA CAMPANA N 11', cap: '60027', comune: 'OSIMO', provincia: 'AN', nazione: 'IT',
};
// 6/11/2026 14:01 ora di Roma
const QUANDO = new Date('2026-11-06T13:01:08Z');

describe('calcolo di una riga (come la pagina dell\'Agenzia)', () => {
  it('Acqua 1,50 € al 22%: valori accettati nella prova reale del 6/11/2026', () => {
    expect(calcolaRiga({ descrizione: 'Acqua', quantita: 1, prezzoLordo: '1.50', aliquotaIVA: '22' })).toEqual({
      idElementoContabile: '', resiPregressi: '0.00', reso: '0.00', quantita: '1.00', descrizioneProdotto: 'Acqua',
      prezzoLordo: '1.50', prezzoUnitario: '1.22950820', scontoUnitario: '0.00000000', scontoLordo: '0.00000000',
      aliquotaIVA: '22', importoIVA: '0.27049180', imponibile: '1.22950820', imponibileNetto: '1.22950820',
      totale: '1.50000000', omaggio: 'N',
    });
  });

  it('Kebab 13 € al 10%: stessi importi del documento emesso da Billy il 25/10/2026', () => {
    const r = calcolaRiga({ descrizione: 'Kebab veg', quantita: 1, prezzoLordo: 13, aliquotaIVA: '10' });
    expect(r.imponibile).toBe('11.81818182');
    expect(r.importoIVA).toBe('1.18181818');
    expect(r.totale).toBe('13.00000000');
  });

  it('più pezzi: l\'IVA si calcola sul totale della riga, non pezzo per pezzo', () => {
    const r = calcolaRiga({ descrizione: 'Casciu', quantita: 3, prezzoLordo: 10, aliquotaIVA: '10' });
    expect(r.totale).toBe('30.00000000');
    expect(r.imponibile).toBe('27.27272727');
    expect(r.importoIVA).toBe('2.72727273');
  });

  it('rifiuta descrizioni vuote, quantità nulle, prezzi con 3 decimali e aliquote inventate', () => {
    expect(() => calcolaRiga({ descrizione: ' ', quantita: 1, prezzoLordo: 1, aliquotaIVA: '10' })).toThrow(ErroreDocumento);
    expect(() => calcolaRiga({ descrizione: 'X', quantita: 0, prezzoLordo: 1, aliquotaIVA: '10' })).toThrow(ErroreDocumento);
    expect(() => calcolaRiga({ descrizione: 'X', quantita: 1, prezzoLordo: '1.505', aliquotaIVA: '10' })).toThrow(ErroreDocumento);
    expect(() => calcolaRiga({ descrizione: 'X', quantita: 1, prezzoLordo: 1, aliquotaIVA: '7' as never })).toThrow(ErroreDocumento);
  });
});

describe('documento di vendita', () => {
  const prova = documentoVendita({
    cedente: PASTARE, righe: [{ descrizione: 'Acqua', quantita: 1, prezzoLordo: '1.50', aliquotaIVA: '22' }],
    pagamenti: { contanti: '1.50' }, quando: QUANDO,
  });

  it('riproduce i totali della vendita accettata DCW2026/6535-7349', () => {
    expect(prova.documentoCommerciale).toMatchObject({
      dataOra: '06/11/2026', importoTotaleIva: '0.27049180', totaleImponibile: '1.22950820',
      ammontareComplessivo: '1.50000000', scontoTotale: '0.00000000', totaleNonRiscosso: '0.00000000',
    });
    expect(prova.documentoCommerciale.vendita.at(0)).toEqual({ tipo: 'PC', importo: '1.50' });
    expect(prova.datiTrasmissione).toEqual({ formato: 'DCW10' });
  });

  it('invia sempre la nazione dell\'esercente (primo tentativo rifiutato senza)', () => {
    expect(prova.cedentePrestatore.altriDatiIdentificativi.nazione).toBe('IT');
    expect(() => documentoVendita({
      cedente: { ...PASTARE, nazione: '' }, righe: [{ descrizione: 'Acqua', quantita: 1, prezzoLordo: 1, aliquotaIVA: '22' }],
      pagamenti: { contanti: 1 }, quando: QUANDO,
    })).toThrow(/Nazione/);
  });

  it('somma più righe e pagamenti misti', () => {
    const d = documentoVendita({
      cedente: PASTARE,
      righe: [
        { descrizione: 'Kebab veg', quantita: 2, prezzoLordo: 12, aliquotaIVA: '10' },
        { descrizione: 'Patate', quantita: 1, prezzoLordo: 5, aliquotaIVA: '10' },
      ],
      pagamenti: { contanti: 9, elettronico: 20 }, quando: QUANDO,
    });
    expect(d.documentoCommerciale.ammontareComplessivo).toBe('29.00000000');
    expect(d.documentoCommerciale.vendita.slice(0, 2)).toEqual([{ tipo: 'PC', importo: '9.00' }, { tipo: 'PE', importo: '20.00' }]);
  });

  it('blocca i pagamenti che non coincidono con il totale', () => {
    expect(() => documentoVendita({
      cedente: PASTARE, righe: [{ descrizione: 'Kebab veg', quantita: 1, prezzoLordo: 12, aliquotaIVA: '10' }],
      pagamenti: { elettronico: 10 }, quando: QUANDO,
    })).toThrow(/non coincidono/);
  });

  it('un omaggio non entra nel totale da pagare', () => {
    const d = documentoVendita({
      cedente: PASTARE,
      righe: [
        { descrizione: 'VegMan', quantita: 1, prezzoLordo: 10, aliquotaIVA: '10' },
        { descrizione: 'Tenerina', quantita: 1, prezzoLordo: 5, aliquotaIVA: '10', omaggio: true },
      ],
      pagamenti: { contanti: 10 }, quando: QUANDO,
    });
    expect(d.documentoCommerciale.ammontareComplessivo).toBe('10.00000000');
  });

  it('omaggio totale: documento a 0 € senza pagamenti', () => {
    const d = documentoVendita({
      cedente: PASTARE, righe: [{ descrizione: 'Kebab veg', quantita: 2, prezzoLordo: 12, aliquotaIVA: '10', omaggio: true }],
      pagamenti: {}, quando: QUANDO,
    });
    expect(d.documentoCommerciale.ammontareComplessivo).toBe('0.00000000');
    expect(d.documentoCommerciale.elementiContabili[0]!.omaggio).toBe('Y');
    expect(d.documentoCommerciale.vendita.every((v) => v.importo === '0.00')).toBe(true);
  });

  const vendita = (nr: Record<string, unknown>, altri: Record<string, unknown> = {}) => documentoVendita({
    cedente: PASTARE, righe: [{ descrizione: 'Kebab veg', quantita: 3, prezzoLordo: 12, aliquotaIVA: '10' }],
    pagamenti: { ...altri, nonRiscosso: nr }, quando: QUANDO,
  });
  const voce = (d: ReturnType<typeof vendita>, tipo: string) => d.documentoCommerciale.vendita.find((v) => v.tipo === tipo)!.importo;

  it('non riscosso con fattura (NR_EF): tutto il totale, come la pagina dell\'Agenzia', () => {
    const d = vendita({ fattura: true });
    expect(voce(d, 'NR_EF')).toBe('36.00');
    expect(voce(d, 'PC')).toBe('0.00');
    expect(d.documentoCommerciale.totaleNonRiscosso).toBe('36.00000000');
    expect(() => vendita({ fattura: true }, { contanti: 36 })).toThrow(/fattura/);
  });

  it('non riscosso per beni consegnati (NR_CS) e servizi (NR_PS), anche insieme ai contanti', () => {
    const d = vendita({ beni: 30 }, { contanti: 6 });
    expect(voce(d, 'NR_CS')).toBe('30.00');
    expect(voce(d, 'NR_EF')).toBe('0.00');
    expect(d.documentoCommerciale.totaleNonRiscosso).toBe('30.00000000');
    expect(voce(vendita({ servizi: 36 }), 'NR_PS')).toBe('36.00');
    expect(() => vendita({ beni: 20 })).toThrow(/non coincidono/);
  });
});

describe('annullo', () => {
  it('riformatta i valori letti dall\'Agenzia e richiama il progressivo originario', () => {
    const a = documentoAnnullo({
      cedente: PASTARE, quando: new Date('2026-11-06T13:01:51Z'),
      originale: {
        idtrx: '265328092',
        datiTrasmissione: { numeroProgressivo: 'DCW2026/6535-7349' },
        documentoCommerciale: {
          elementiContabili: [{ idElementoContabile: '999', descrizioneProdotto: 'Acqua', quantita: '1', prezzoLordo: '1.5', aliquotaIVA: '22', omaggio: 'N' }],
        },
      },
    });
    expect(a.documentoCommerciale.resoAnnullo).toEqual({ tipologia: 'A', dataOra: '06/11/2026', progressivo: 'DCW2026/6535-7349' });
    expect(a.documentoCommerciale).not.toHaveProperty('vendita');
    expect(a.documentoCommerciale.ammontareComplessivo).toBe('1.50000000');
    expect(a.documentoCommerciale.elementiContabili.at(0)).toMatchObject({ idElementoContabile: '999', quantita: '1.00', prezzoLordo: '1.50', totale: '1.50000000' });
  });
});

describe('data e risposta', () => {
  it('usa la data di Roma anche dopo mezzanotte UTC', () => {
    expect(dataAgenzia(new Date('2026-08-08T22:30:00Z'))).toBe('09/08/2026');
  });

  it('legge esiti positivi e negativi', () => {
    expect(leggiEsito({ esito: true, idtrx: '265328092', progressivo: 'DCW2026/6535-7349', errori: [] }))
      .toEqual({ ok: true, idtrx: '265328092', progressivo: 'DCW2026/6535-7349' });
    expect(leggiEsito({ esito: false, errori: [{ codice: 'EF0', descrizione: "'Nazione' non presente" }] }))
      .toEqual({ ok: false, errori: [{ codice: 'EF0', descrizione: "'Nazione' non presente" }] });
    expect(leggiEsito('<html>').ok).toBe(false);
  });
});
