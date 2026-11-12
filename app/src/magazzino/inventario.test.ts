import { describe, expect, it } from 'vitest';
import type { Ingrediente, Prodotto } from '../foodcost/modello';
import { cambiaScelta, chiave, daContare, leggiBozza, numero, preparaInventario, preparaUnita, totale, vociMagazzino } from './inventario';

const ING: Ingrediente[] = [
  { id: 'c', nome: 'Ceci secchi', categoria: 'alimentare', unita: 'g', gruppo: '', confezione: 5000 },
  { id: 'v', nome: 'Vaschette', categoria: 'packaging', unita: 'pz', gruppo: '', confezione: null },
  { id: 'a', nome: 'Aglio', categoria: 'alimentare', unita: 'g', gruppo: '', confezione: null },
];
const PRO = [
  { id: 'm', nome: 'Mayo', tipo: 'semilavorato', resa: { quantita: 5600, unita: 'g' } },
  { id: 'k', nome: 'Kebab', tipo: 'vendibile', resa: { quantita: 1, unita: 'pz' } },
] as unknown as Prodotto[];

describe('inventario del magazzino', () => {
  it('voci: ingredienti, packaging, semilavorati (niente prodotti finiti), con la confezione', () => {
    const unita = new Map([[chiave('ingrediente', 'v'), { nome: 'scatola', quantita: 500 }], [chiave('semilavorato', 'm'), { nome: 'busta', quantita: 1000 }]]);
    const v = vociMagazzino(ING, PRO, unita);
    expect(v.map((x) => [x.nome, x.sezione, x.conta?.nome ?? null])).toEqual([
      ['Aglio', 'alimentare', null], ['Ceci secchi', 'alimentare', 'confezione'], ['Vaschette', 'packaging', 'scatola'], ['Mayo', 'semilavorato', 'busta'],
    ]);
    expect(vociMagazzino([], [{ ...PRO[0]!, resa: { quantita: 1, unita: '' } }], new Map())[0]!.unita).toBe('pz');
  });

  it('numeri, confezione, totale', () => {
    expect(numero(' 2,5 ', 'x')).toBe(2.5);
    expect(numero('', 'x')).toBe(0);
    expect(() => numero('-1', 'Sfuso')).toThrow(/Sfuso/);
    expect(preparaUnita(' sacco ', '5000')).toEqual({ nome: 'sacco', quantita: 5000 });
    expect(() => preparaUnita('', '1')).toThrow(/nome/);
    expect(() => preparaUnita('sacco', '0')).toThrow(/più di zero/);
    expect(totale({ confezioni: 3, sfuso: 1200 }, { nome: 'sacco', quantita: 5000 })).toBe(16200);
    expect(totale({ confezioni: 3, sfuso: 7 }, null)).toBe(7);
  });

  it('inventario: solo le voci contate, totale nell\'unità di base; bozza', () => {
    const voci = vociMagazzino(ING, PRO, new Map());
    const inv = preparaInventario(voci, { [chiave('ingrediente', 'c')]: { confezioni: 2, sfuso: 300 }, [chiave('semilavorato', 'm')]: { confezioni: 0, sfuso: 800 } }, '2026-11-12', ' dopo la fiera ');
    expect(inv).toEqual({
      giorno: '2026-11-12', nota: 'dopo la fiera', righe: [
        { tipo: 'ingrediente', id: 'c', nome: 'Ceci secchi', unita: 'g', quantita: 10300, confezioni: 2, sfuso: 300, confezione: { nome: 'confezione', quantita: 5000 } },
        { tipo: 'semilavorato', id: 'm', nome: 'Mayo', unita: 'g', quantita: 800, confezioni: 0, sfuso: 800 },
      ],
    });
    expect(() => preparaInventario(voci, {}, '2026-11-12')).toThrow(/Non hai contato/);
    expect(preparaInventario(voci, { [chiave('ingrediente', 'a')]: { confezioni: 0, sfuso: 0 } }, '2026-11-12', '  ')).not.toHaveProperty('nota');
    expect(leggiBozza(null, '2026-11-12')).toEqual({ giorno: '2026-11-12', conte: {} });
    expect(leggiBozza('{rotto', 'g')).toEqual({ giorno: 'g', conte: {} });
    expect(leggiBozza(JSON.stringify({ giorno: '2026-11-11', conte: { x: { confezioni: 1, sfuso: 0 } } }), 'g').giorno).toBe('2026-11-11');
  });

  it('voci da contare scelte dal titolare: senza scelta tutto, poi solo le spuntate (le nuove restano fuori)', () => {
    const voci = vociMagazzino(ING, PRO, new Map());
    const tutte = voci.map((v) => v.chiave);
    expect(daContare(voci, null).map((v) => v.chiave)).toEqual(tutte);
    const una = cambiaScelta(voci, null, tutte.slice(1), false);
    expect(una).toEqual([tutte[0]]);
    expect(daContare(voci, una).map((v) => v.chiave)).toEqual([tutte[0]]);
    expect(cambiaScelta(voci, una, [tutte[1]!, 'ingrediente-sparito'], true)).toEqual(tutte.slice(0, 2));
    expect(cambiaScelta(voci, [], tutte, true)).toEqual(tutte);
    expect(daContare(voci, [])).toEqual([]);
  });
});
