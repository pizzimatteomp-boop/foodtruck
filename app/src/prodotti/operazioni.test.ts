import type { Prodotto } from '../foodcost/modello';
import { creaGiro, ErroreProdotto, preparaProdotto, usatoIn } from './operazioni';

const prod = (id: string, ricetta: Prodotto['ricetta'], o: Partial<Prodotto> = {}): Prodotto =>
  ({ id, nome: id, tipo: 'semilavorato', gruppo: '', prezzo: 0, resa: { quantita: 1000, unita: 'g' }, ricetta, quotaVendite: 0, ...o });
const mayo = prod('mayo', [{ tipo: 'ingrediente', id: 'olio', quantita: 800 }]);
const salsa = prod('salsa', [{ tipo: 'prodotto', id: 'mayo', quantita: 100 }]);
const prodotti = new Map([mayo, salsa].map((p) => [p.id, p]));
const base = {
  nome: ' Wrap ', nomeEn: ' Wrap ', tipo: 'vendibile' as const, gruppo: ' Panini ', prezzo: '9,50', iva: '10', resaQuantita: '1', resaUnita: '',
  inMenu: true, soglia: '30', ricetta: [{ tipo: 'ingrediente' as const, id: 'pita', quantita: '1' }, { tipo: 'prodotto' as const, id: 'salsa', quantita: '30,5' }],
};

describe('prodotto', () => {
  it('ripulisce e converte i numeri', () => {
    expect(preparaProdotto(base, null, prodotti, 12)).toEqual({
      nome: 'Wrap', nomeEn: 'Wrap', tipo: 'vendibile', gruppo: 'Panini', prezzo: 9.5, iva: '10', resa: { quantita: 1, unita: 'pz' },
      ricetta: [{ tipo: 'ingrediente', id: 'pita', quantita: 1 }, { tipo: 'prodotto', id: 'salsa', quantita: 30.5 }],
      quotaVendite: 12, inMenu: true, soglia: 30,
    });
  });
  it('semilavorato: niente prezzo, mai in menu, resa in grammi di default', () => {
    const s = preparaProdotto({ ...base, tipo: 'semilavorato', prezzo: '', resaQuantita: '1000', soglia: null }, null, prodotti);
    expect(s).toMatchObject({ prezzo: 0, inMenu: false, resa: { quantita: 1000, unita: 'g' }, soglia: null });
  });
  it('errori chiari', () => {
    const e = (x: Partial<typeof base>, id: string | null = null) => () => preparaProdotto({ ...base, ...x } as typeof base, id, prodotti);
    expect(e({ nome: '' })).toThrow('nome');
    expect(e({ nome: 'x'.repeat(81) })).toThrow('lungo');
    expect(e({ prezzo: '0' })).toThrow('prezzo');
    expect(e({ iva: '7' })).toThrow('IVA');
    expect(e({ resaQuantita: '0' })).toThrow('pezzi');
    expect(e({ soglia: '150' })).toThrow('soglia');
    expect(e({ ricetta: [{ tipo: 'ingrediente', id: '', quantita: '1' }] })).toThrow('Riga 1: scegli');
    expect(e({ ricetta: [{ tipo: 'ingrediente', id: 'x', quantita: '0' }] })).toThrow('Riga 1: scrivi la quantità');
    expect(e({ ricetta: [{ tipo: 'prodotto', id: 'w', quantita: '1' }] }, 'w')).toThrow('sé stessa');
    expect(e({ ricetta: Array.from({ length: 101 }, () => ({ tipo: 'ingrediente' as const, id: 'x', quantita: '1' })) })).toThrow(ErroreProdotto);
  });
  it('ricette che si richiamano a vicenda: bloccate', () => {
    // la mayo non può usare la salsa, che usa la mayo
    expect(creaGiro('mayo', [{ tipo: 'prodotto', id: 'salsa', quantita: 1 }], prodotti)).toBe(true);
    expect(creaGiro('nuovo', [{ tipo: 'prodotto', id: 'salsa', quantita: 1 }], prodotti)).toBe(false);
    expect(() => preparaProdotto({ ...base, tipo: 'semilavorato', ricetta: [{ tipo: 'prodotto', id: 'salsa', quantita: '1' }] }, 'mayo', prodotti)).toThrow('a vicenda');
  });
  it('dove è usato un semilavorato', () => {
    expect(usatoIn('mayo', prodotti.values()).map((p) => p.id)).toEqual(['salsa']);
    expect(usatoIn('salsa', prodotti.values())).toEqual([]);
  });
});
