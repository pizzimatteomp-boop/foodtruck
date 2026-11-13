import { describe, expect, it } from 'vitest';
import { cambiaScorta, inConfezioni, preparaScorta, sottoScorta, testoScorta } from './scorte';
import type { VoceMagazzino } from './inventario';
import type { Stock } from './stock';

const olio: VoceMagazzino = { chiave: 'ingrediente-olio', tipo: 'ingrediente', id: 'olio', nome: 'Olio', sezione: 'alimentare', unita: 'ml', conta: { nome: 'taniche', quantita: 5000 } };
const sale: VoceMagazzino = { chiave: 'ingrediente-sale', tipo: 'ingrediente', id: 'sale', nome: 'Sale', sezione: 'alimentare', unita: 'g', conta: null };
const mayo: VoceMagazzino = { chiave: 'semilavorato-mayo', tipo: 'semilavorato', id: 'mayo', nome: 'Mayo', sezione: 'semilavorato', unita: 'g', conta: { nome: 'buste', quantita: 1000 } };
const vaschette: VoceMagazzino = { chiave: 'ingrediente-v', tipo: 'ingrediente', id: 'v', nome: 'Vaschette', sezione: 'packaging', unita: 'pz', conta: null };
const st = (chiave: string, teorico: number | null): Stock => ({ chiave, base: teorico === null ? null : { giorno: '2026-11-10', ms: 0, quantita: teorico }, entrate: 0, uscite: 0, teorico });

describe('scorte minime', () => {
  it('soglia scritta in confezioni (o nell\'unità di base) → unità di base; vuoto = nessuna', () => {
    expect(preparaScorta('2', olio)).toBe(10000);
    expect(preparaScorta('1,5', olio)).toBe(7500);
    expect(preparaScorta('500', sale)).toBe(500);
    expect(preparaScorta('', olio)).toBeNull();
    expect(preparaScorta('0', olio)).toBeNull();
    expect(() => preparaScorta('tanto', olio)).toThrow('Scorta minima');
    expect(testoScorta(7500, olio)).toBe('1,5');
    expect(testoScorta(500, sale)).toBe('500');
    expect(testoScorta(undefined, sale)).toBe('');
  });

  it('cambia e toglie una soglia', () => {
    expect(cambiaScorta({}, 'a', 5)).toEqual({ a: 5 });
    expect(cambiaScorta({ a: 5, b: 1 }, 'a', null)).toEqual({ b: 1 });
  });

  it('in confezioni', () => {
    expect(inConfezioni(7500, olio)).toBe('1,5 taniche');
    expect(inConfezioni(1200, sale)).toBe('1,2 kg');
  });

  it('sotto scorta: solo voci contate con soglia, le più scoperte prima; semilavorati da produrre', () => {
    const voci = [olio, sale, mayo, vaschette];
    const stock = [st(olio.chiave, 4000), st(sale.chiave, 900), st(mayo.chiave, -200), st(vaschette.chiave, null)];
    const s = sottoScorta(voci, stock, { [olio.chiave]: 10000, [sale.chiave]: 500, [mayo.chiave]: 2000, [vaschette.chiave]: 100 });
    expect(s.map((x) => x.chiave)).toEqual([mayo.chiave, olio.chiave]);
    expect(s[0]).toMatchObject({ azione: 'da produrre', testo: 'Mayo da produrre: ne hai 0 buste, minimo 2 buste' });
    expect(s[1]!.testo).toBe('Olio da ricomprare: ne hai 0,8 taniche, minimo 2 taniche');
    expect(sottoScorta(voci, stock, {})).toEqual([]);
  });
});
