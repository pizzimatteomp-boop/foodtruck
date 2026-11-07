import { describe, expect, it } from 'vitest';
import { cassaforte, ErroreCredenziali, preparaCredenziali, type DepositoSicuro } from './cassaforte';

// Valori inventati.
const FINTE = { codiceFiscale: ' xxxxxx00x00x000x ', password: 'pass-finta', pin: '0123456789' };

function deposito(): DepositoSicuro & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); }, remove: async (k) => m.delete(k) };
}

describe('cassaforte delle credenziali', () => {
  it('controlla la forma senza mai mettere i valori nei messaggi', () => {
    expect(preparaCredenziali(FINTE)).toEqual({ codiceFiscale: 'XXXXXX00X00X000X', password: 'pass-finta', pin: '0123456789' });
    for (const c of [{ ...FINTE, codiceFiscale: 'ABC' }, { ...FINTE, password: '' }, { ...FINTE, pin: '12345' }]) {
      try { preparaCredenziali(c); expect.unreachable(); } catch (e) {
        expect(e).toBeInstanceOf(ErroreCredenziali);
        expect((e as Error).message).not.toMatch(/ABC|12345|pass-finta|0123456789/);
      }
    }
  });

  it('salva, legge, dice se ci sono e cancella', async () => {
    const d = deposito();
    const c = cassaforte(d);
    expect(await c.presenti()).toBe(false);
    await c.salva(FINTE);
    expect(await c.presenti()).toBe(true);
    expect((await c.leggi())?.codiceFiscale).toBe('XXXXXX00X00X000X');
    expect([...d.m.keys()]).toEqual(['fisconline']);
    await c.cancella();
    expect(await c.leggi()).toBeNull();
  });

  it('dati rovinati o incompleti = nessuna credenziale', async () => {
    const d = deposito();
    const c = cassaforte(d);
    d.m.set('fisconline', '{rotto');
    expect(await c.leggi()).toBeNull();
    d.m.set('fisconline', '{"codiceFiscale":"X"}');
    expect(await c.leggi()).toBeNull();
    await expect(c.salva({ ...FINTE, pin: '1' })).rejects.toBeInstanceOf(ErroreCredenziali);
    expect(d.m.get('fisconline')).toBe('{"codiceFiscale":"X"}');
  });
});
