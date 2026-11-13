import { describe, expect, it } from 'vitest';
import type { Prodotto } from '../foodcost/modello';
import type { VoceMagazzino } from '../magazzino/inventario';
import {
  daCaricare, daProdurre, numeroPrevisione, percentualiReali, pezziPrevisti, pianoDiCarico, previsioneDiBase, sommaPercentuali, testoManca,
} from './carico';

// Dati inventati.
const prodotto = (p: Partial<Prodotto> & Pick<Prodotto, 'id' | 'nome'>): Prodotto => ({ tipo: 'vendibile', gruppo: '', prezzo: 0, resa: { quantita: 1, unita: 'pz' }, ricetta: [], quotaVendite: 0, ...p });
const mayo = prodotto({ id: 'mayo', nome: 'Mayo', tipo: 'semilavorato', resa: { quantita: 1000, unita: 'g' }, ricetta: [{ tipo: 'ingrediente', id: 'olio', quantita: 800 }] });
const kebab = prodotto({ id: 'kebab', nome: 'Kebab', prezzo: 12, quotaVendite: 34.5, ricetta: [
  { tipo: 'ingrediente', id: 'pane', quantita: 1 }, { tipo: 'prodotto', id: 'mayo', quantita: 30 }, { tipo: 'ingrediente', id: 'vaschetta', quantita: 1 },
] } as never);
const patate = prodotto({ id: 'patate', nome: 'Patate', prezzo: 5, quotaVendite: 14.7, ricetta: [{ tipo: 'ingrediente', id: 'patate', quantita: 250 }, { tipo: 'ingrediente', id: 'vaschetta', quantita: 1 }] });
const tempeh = prodotto({ id: 'tempeh', nome: 'Tempeh', prezzo: 10, ricetta: [{ tipo: 'ingrediente', id: 'tempeh', quantita: 1 }] });
const prodotti = [mayo, kebab, patate, tempeh];
const voce = (v: Partial<VoceMagazzino> & Pick<VoceMagazzino, 'chiave' | 'nome' | 'sezione' | 'unita'>): VoceMagazzino => ({ tipo: 'ingrediente', id: v.chiave.split('-')[1]!, conta: null, ...v });
const voci = [
  voce({ chiave: 'ingrediente-pane', nome: 'Pane', sezione: 'alimentare', unita: 'pz', conta: { nome: 'buste', quantita: 50 } }),
  voce({ chiave: 'ingrediente-patate', nome: 'Patate', sezione: 'alimentare', unita: 'g', conta: { nome: 'sacchi', quantita: 5000 } }),
  voce({ chiave: 'ingrediente-tempeh', nome: 'Tempeh', sezione: 'alimentare', unita: 'pz' }),
  voce({ chiave: 'ingrediente-vaschetta', nome: 'Vaschette', sezione: 'packaging', unita: 'pz' }),
  voce({ chiave: 'semilavorato-mayo', nome: 'Mayo', sezione: 'semilavorato', unita: 'g', tipo: 'semilavorato', conta: { nome: 'buste', quantita: 1000 } }),
];

describe('previsione dell\'evento', () => {
  it('valori di base: salvati, altrimenti la quota delle vendite del prodotto (solo vendibili)', () => {
    expect(previsioneDiBase(prodotti)).toEqual({ kebab: { modo: '%', valore: 34.5 }, patate: { modo: '%', valore: 14.7 }, tempeh: { modo: '%', valore: 0 } });
    expect(previsioneDiBase(prodotti, { tempeh: { modo: 'pz', valore: 60 } }).tempeh).toEqual({ modo: 'pz', valore: 60 });
    expect(sommaPercentuali({ a: { modo: '%', valore: 34.5 }, b: { modo: '%', valore: 14.7 }, c: { modo: 'pz', valore: 60 } })).toBe(49.2);
  });

  it('numeri scritti a mano', () => {
    expect(numeroPrevisione('23,5', 'x')).toBe(23.5);
    expect(numeroPrevisione('', 'x')).toBe(0);
    expect(() => numeroPrevisione('-1', 'Fatturato')).toThrow('Fatturato');
    expect(() => numeroPrevisione('120', '%', 100)).toThrow('%');
  });

  it('pezzi: % del fatturato / prezzo × scorta, arrotondati in su; pezzi fissi senza scorta', () => {
    const prev = { kebab: { modo: '%' as const, valore: 34.5 }, patate: { modo: '%' as const, valore: 14.7 }, tempeh: { modo: 'pz' as const, valore: 60 } };
    const p = pezziPrevisti(prodotti, prev, 3000, 15);
    // kebab: 3000×34,5% = 1035 € / 12 = 86,25 × 1,15 = 99,19 → 100; patate: 441 € / 5 = 88,2 × 1,15 = 101,43 → 102
    expect(p).toEqual([
      { id: 'patate', nome: 'Patate', modo: '%', pezzi: 102, incasso: 441 },
      { id: 'kebab', nome: 'Kebab', modo: '%', pezzi: 100, incasso: 1035 },
      { id: 'tempeh', nome: 'Tempeh', modo: 'pz', pezzi: 60, incasso: 600 },
    ]);
    expect(pezziPrevisti(prodotti, prev, 0, 15).map((x) => x.id)).toEqual(['tempeh']);
    expect(pezziPrevisti([{ ...kebab, prezzo: 0 }], prev, 3000, 0)).toEqual([]);
    expect(pezziPrevisti(prodotti, { kebab: { modo: '%', valore: 0 } }, 3000, 0)).toEqual([]);
  });

  it('piano di carico: ricette scomposte, semilavorati pronti, confezioni in su, confronto con lo stock', () => {
    const stock = new Map<string, number | null>([['ingrediente-pane', 120], ['ingrediente-patate', 30000], ['semilavorato-mayo', 1000], ['ingrediente-vaschetta', null]]);
    const r = pianoDiCarico([{ id: 'kebab', pezzi: 100 }, { id: 'patate', pezzi: 102 }, { id: 'tempeh', pezzi: 60 }], prodotti, voci, stock);
    expect(r.map((x) => [x.nome, x.quantita, x.confezioni, x.manca])).toEqual([
      ['Pane', 100, 2, 0], ['Patate', 25500, 6, 0], ['Tempeh', 60, null, null],
      ['Mayo', 3000, 3, 2000],
      ['Vaschette', 202, null, null],
    ]);
    // l'olio della Mayo non si carica: la Mayo va pronta
    expect(r.some((x) => x.chiave === 'ingrediente-olio')).toBe(false);
    expect(daCaricare(r[1]!)).toBe('6 sacchi (25,5 kg)');
    expect(daCaricare(r[4]!)).toBe('202 pz');
    expect(testoManca(r[3]!)).toBe('da produrre: 2 buste');
    expect(testoManca(r[0]!)).toBe('');
    expect(testoManca(r[2]!)).toBe('stock non contato');
    expect(testoManca({ ...r[0]!, manca: 30, confezione: null })).toBe('da comprare: 30 pz');
  });

  it('% reali dalle vendite della cassa, annullati esclusi', () => {
    const s = [
      { tipo: 'V' as const, idtrx: '1', righe: [{ quantita: 3, prezzo: 12, prodotto: 'kebab' }, { quantita: 1, prezzo: 4 }] },
      { tipo: 'V' as const, idtrx: '2', righe: [{ quantita: 2, prezzo: 5, prodotto: 'patate' }, { quantita: 1, prezzo: 12, prodotto: 'kebab' }] },
      { tipo: 'V' as const, idtrx: '3', righe: [{ quantita: 10, prezzo: 5, prodotto: 'patate' }] },
      { tipo: 'A' as const, idtrx: '4', idtrxOriginale: '3', righe: [] },
    ];
    expect(percentualiReali(s as never)).toEqual({ kebab: 82.8, patate: 17.2 });
    expect(percentualiReali([])).toBeNull();
  });

  it('lista di produzione: semilavorati mancanti negli eventi non finiti, meno quanto prodotto dopo il piano', () => {
    const riga = (manca: number | null) => ({ chiave: 'semilavorato-mayo', nome: 'Mayo', unita: 'g', sezione: 'semilavorato' as const, manca });
    const carichi = [
      { evento: 'Fiera B', dal: '2026-11-25', al: '2026-11-26', preparatoMs: 100, righe: [riga(1000)] },
      { evento: 'Fiera A', dal: '2026-11-20', al: '2026-11-22', preparatoMs: 100, righe: [riga(2000), { ...riga(500), chiave: 'ingrediente-olio', sezione: 'alimentare' as const }] },
      { evento: 'Passata', dal: '2026-11-01', al: '2026-11-02', preparatoMs: 100, righe: [riga(700)] },
      { evento: 'Fiera C', dal: '2026-11-28', al: '2026-11-28', preparatoMs: 100, righe: [riga(0), riga(null)] },
    ];
    const prod = [{ prodotto: 'mayo', quantita: 1500, ms: 200 }, { prodotto: 'mayo', quantita: 900, ms: 50 }, { prodotto: 'altro', quantita: 5000, ms: 300 }];
    expect(daProdurre(carichi, prod, '2026-11-13')).toEqual([
      { id: 'mayo', nome: 'Mayo', unita: 'g', evento: 'Fiera A', dal: '2026-11-20', serve: 2000, fatto: 1500, resta: 500 },
      { id: 'mayo', nome: 'Mayo', unita: 'g', evento: 'Fiera B', dal: '2026-11-25', serve: 1000, fatto: 0, resta: 1000 },
    ]);
    expect(daProdurre(carichi, [{ prodotto: 'mayo', quantita: 5000, ms: 200 }], '2026-11-13')).toEqual([]);
  });
});
