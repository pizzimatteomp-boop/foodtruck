import { describe, expect, it } from 'vitest';
import { ErroreSumUp, leggiRitorno, nuovoIdTransazione, spiegaCausa, urlPagamento } from './sumup';

describe('SumUp', () => {
  it('indirizzo per aprire SumUp con importo, chiave, app e ritorno', () => {
    const u = new URL(urlPagamento({ chiave: 'abcd-1234-efgh', centesimi: 1650, titolo: 'VegMan', idTransazione: 'vegman-1' }));
    expect(u.protocol).toBe('sumupmerchant:');
    expect(`${u.host}${u.pathname}`).toBe('pay/1.0');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      'affiliate-key': 'abcd-1234-efgh', 'app-id': 'it.vegman.app', total: '16.50', amount: '16.50', currency: 'EUR',
      title: 'VegMan', 'foreign-tx-id': 'vegman-1', 'skip-screen-success': 'true', callback: 'vegman://sumup',
    });
  });

  it('errori: chiave mancante, importo non valido', () => {
    expect(() => urlPagamento({ chiave: '', centesimi: 100, titolo: 'x', idTransazione: '1' })).toThrow(ErroreSumUp);
    expect(() => urlPagamento({ chiave: 'chiave con spazi', centesimi: 100, titolo: 'x', idTransazione: '1' })).toThrow(/Chiave/);
    expect(() => urlPagamento({ chiave: 'abcdefgh', centesimi: 0, titolo: 'x', idTransazione: '1' })).toThrow(/Importo/);
    expect(() => urlPagamento({ chiave: 'abcdefgh', centesimi: 1.5, titolo: 'x', idTransazione: '1' })).toThrow(/Importo/);
  });

  it('ritorno: pagato, non pagato, indirizzi estranei', () => {
    expect(leggiRitorno('vegman://sumup?smp-status=success&smp-message=Transaction%20successful.&smp-receipt-sent=false&smp-tx-code=123ABC&foreign-tx-id=vegman-1'))
      .toEqual({ esito: 'pagato', codice: '123ABC', idTransazione: 'vegman-1', messaggio: 'Transaction successful.' });
    expect(leggiRitorno('vegman://sumup?smp-status=failed&smp-failure-cause=transaction-failed&foreign-tx-id=vegman-2'))
      .toEqual({ esito: 'non pagato', causa: 'transaction-failed', idTransazione: 'vegman-2', messaggio: '' });
    expect(leggiRitorno('vegman://sumup?smp-status=success')).toEqual({ esito: 'pagato', codice: '', idTransazione: '', messaggio: '' });
    expect(leggiRitorno('vegman://sumup')).toMatchObject({ esito: 'non pagato', causa: 'sconosciuta' });
    expect(leggiRitorno('vegman://sumup?smp-status=failed')).toMatchObject({ causa: 'failed' });
    expect(leggiRitorno('https://vegman.it/sumup?smp-status=success')).toBeNull();
    expect(leggiRitorno('vegman://altro')).toBeNull();
    expect(leggiRitorno('non un indirizzo')).toBeNull();
  });

  it('cause leggibili e codici univoci', () => {
    expect(spiegaCausa('invalid-token')).toMatch(/chiave/);
    expect(spiegaCausa('transaction-failed')).toMatch(/annullato/);
    expect(spiegaCausa('geolocation-required')).toMatch(/posizione/);
    expect(spiegaCausa('invalid-param')).toMatch(/non validi/);
    expect(spiegaCausa('boh')).toBe('esito «boh»');
    expect(nuovoIdTransazione(0, () => 0)).toBe('vegman-0-000000');
    expect(nuovoIdTransazione().length).toBeLessThanOrEqual(128);
  });
});
