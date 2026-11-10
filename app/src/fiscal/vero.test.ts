import { describe, expect, it } from 'vitest';
import { documentoVendita } from './dco';
import { SimulatoreAgenzia } from './simulatore';
import { ErroreRete } from './trasporto';
import { cedenteDaAgenzia, DatiEsercenteIncompleti, descriviCedente, riconosceUltima, strutturaDati, trasportoRegistrato, VENDITA_DI_PROVA } from './vero';
import { ServizioDCO } from './servizio';

// Dati inventati, nella forma restituita da dati/fiscali.
const DATI = {
  identificativiFiscali: { codicePaese: 'IT', partitaIva: '00000000000', codiceFiscale: 'XXXXXX00X00X000X' },
  altriDatiIdentificativi: { nome: 'MARIO', cognome: 'PROVA', indirizzo: 'VIA FINTA', numeroCivico: 3, cap: '00000', comune: 'PROVA', provincia: 'XX' },
  multiAttivita: [],
};

describe('vendita vera: preparazione', () => {
  it('dati dell\'esercente → cedente, nazione IT aggiunta; documento valido', () => {
    const c = cedenteDaAgenzia(DATI);
    expect(c).toEqual({ partitaIva: '00000000000', codiceFiscale: 'XXXXXX00X00X000X', indirizzo: 'VIA FINTA', numeroCivico: '3', cap: '00000', comune: 'PROVA', provincia: 'XX', nazione: 'IT', nome: 'MARIO', cognome: 'PROVA' });
    expect(descriviCedente(c)).toBe('MARIO PROVA · P.IVA 00000000000 · VIA FINTA 3, 00000 PROVA (XX) IT');
    const d = documentoVendita({ cedente: c, righe: [VENDITA_DI_PROVA], pagamenti: { contanti: 1.5 }, quando: new Date('2026-11-07T12:00:00Z') });
    expect(d.cedentePrestatore.altriDatiIdentificativi.nazione).toBe('IT');
    expect(d.documentoCommerciale.ammontareComplessivo).toBe('1.50000000');
  });

  it('con denominazione, nazione già presente, senza civico', () => {
    const c = cedenteDaAgenzia({ ...DATI, altriDatiIdentificativi: { ...DATI.altriDatiIdentificativi, denominazione: 'DITTA PROVA', numeroCivico: '', nazione: 'IT' } });
    expect(c.denominazione).toBe('DITTA PROVA');
    expect(c.numeroCivico).toBeUndefined();
    expect(descriviCedente(c)).toBe('DITTA PROVA · P.IVA 00000000000 · VIA FINTA, 00000 PROVA (XX) IT');
  });

  it('dati incompleti: errore che dice cosa manca', () => {
    expect(() => cedenteDaAgenzia(null)).toThrow(DatiEsercenteIncompleti);
    expect(() => cedenteDaAgenzia({ ...DATI, altriDatiIdentificativi: { cap: 5 } })).toThrow(/indirizzo, comune, provincia, denominazione o cognome\. Campi ricevuti: \{identificativiFiscali\{codicePaese, partitaIva, codiceFiscale\}, altriDatiIdentificativi\{cap\}, multiAttivita\[0\]\}/);
    expect(strutturaDati({ a: [{ b: 1 }], c: 'SEGRETO' })).toBe('{a[1 × {b}], c}');
    expect(strutturaDati('x')).toBe('string');
  });

  it('il registro annota percorso e codice, mai i contenuti', async () => {
    const reg: string[] = [];
    const sim = new SimulatoreAgenzia();
    const t = trasportoRegistrato(sim, reg);
    await t.invia({ metodo: 'GET', percorso: 'doc/documenti/dati/fiscali' });
    sim.sessioneValida = false;
    await t.invia({ metodo: 'POST', percorso: 'doc/documenti/', corpo: { segreto: 'NON-DEVE-COMPARIRE' } });
    await expect(trasportoRegistrato({ invia: async () => { throw new ErroreRete('giù'); } }, reg).invia({ metodo: 'GET', percorso: 'doc/documenti/ultimo/?a=1' })).rejects.toThrow();
    await expect(trasportoRegistrato({ invia: async () => { throw null; } }, reg).invia({ metodo: 'GET', percorso: 'x' })).rejects.toBeNull();
    expect(reg).toEqual([
      'GET doc/documenti/dati/fiscali → 200 [application/json]',
      'POST doc/documenti/ → 200 [text/html] → pagina di accesso',
      'GET doc/documenti/ultimo/ → rete (giù)',
      'GET x → rete ()',
    ]);
    expect(reg.join()).not.toContain('NON-DEVE');
  });

  it('passo 9: l\'ultima vendita letta dall\'Agenzia (numeri «grezzi») è riconosciuta come la vendita di prova', async () => {
    const sim = new SimulatoreAgenzia();
    const s = new ServizioDCO(sim);
    const c = cedenteDaAgenzia(DATI);
    const quando = '2026-11-07T23:00:26.000Z'; // 8/11 00:00:26 a Roma
    const r = await s.invia(documentoVendita({ cedente: c, righe: [VENDITA_DI_PROVA], pagamenti: { contanti: 1.5 }, quando: new Date(quando) }));
    const ultima = await s.ultimaVendita();
    expect(riconosceUltima(ultima, { idtrx: r.idtrx, quando }, c)).toMatchObject({ stessa: true, riconosciuta: true, dettaglio: expect.stringContaining('data Agenzia «08/11/2026», nostra «08/11/2026»') });
    expect(riconosceUltima(ultima, { idtrx: 'altro', quando: '2026-11-09T10:00:00Z' }, c)).toMatchObject({ stessa: false, riconosciuta: false });
    expect(riconosceUltima(null, { idtrx: r.idtrx, quando }, c)).toEqual({ stessa: false, riconosciuta: false, dettaglio: 'nessuna ultima vendita' });
    expect(strutturaDati(await s.ultimoGrezzo())).toBe('number');
    // «ultimo» come lo dà l'Agenzia: numero, testo, 0, idtrx inesistente, oggetto completo; errori diversi da 404 risalgono
    const finto = (corpo: unknown, doc = true) => new ServizioDCO({ invia: async (q) => (q.percorso === 'doc/documenti/ultimo/' ? { stato: 200, tipo: 'application/json', corpo }
      : doc ? sim.invia(q) : { stato: 500, tipo: 'text/html', corpo: '' }) });
    expect((await finto(r.idtrx).ultimaVendita())?.idtrx).toBe(r.idtrx);
    expect(await finto(0).ultimaVendita()).toBeNull();
    expect(await finto(null).ultimaVendita()).toBeNull();
    expect(await finto('999').ultimaVendita()).toBeNull();
    expect((await finto({ idtrx: 'X', datiTrasmissione: {}, documentoCommerciale: { elementiContabili: [] } }).ultimaVendita())?.idtrx).toBe('X');
    await expect(finto(5, false).ultimaVendita()).rejects.toThrow();
    const senzaId = new ServizioDCO({ invia: async (q) => (q.percorso === 'doc/documenti/ultimo/' ? { stato: 200, tipo: 'application/json', corpo: 77 }
      : { stato: 200, tipo: 'application/json', corpo: { datiTrasmissione: { numeroProgressivo: 'P' }, documentoCommerciale: { elementiContabili: [] } } }) });
    expect((await senzaId.ultimaVendita())?.idtrx).toBe('77');
  });
});
