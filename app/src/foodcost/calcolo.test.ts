import type { Acquisto, Articolo, Ingrediente, Prodotto } from './modello';
import { costoProdotto, foodCost, prezzoIngrediente } from './calcolo';

const ing = (id: string, nome = id, unita = 'g'): Ingrediente => ({ id, nome, categoria: 'alimentare', unita, gruppo: '', confezione: null });
const art = (id: string, ingrediente: string | null, fattore = 1): Articolo => ({ id, nome: id, unita: 'KG', categoria: 'alimentare', ingrediente, fattore });
const acq = (id: string, articolo: string, data: string, quantita: number, prezzoUnitario: number): Acquisto =>
  ({ id, data, fornitore: 'F', descrizione: id, articolo, quantita, unita: 'KG', prezzoUnitario, fattura: null, origine: 'manuale' });
const prod = (id: string, ricetta: Prodotto['ricetta'], o: Partial<Prodotto> = {}): Prodotto =>
  ({ id, nome: id, tipo: 'vendibile', gruppo: '', prezzo: 10, resa: { quantita: 1, unita: 'pz' }, ricetta, quotaVendite: 0, ...o });
const OGGI = '2026-11-06';

describe('prezzo di un ingrediente', () => {
  // Ceci: articolo «sacco 5 kg» (fattore 5000 g) da Metro, «scatola 400 g» (fattore 400 g) da Conad.
  const articoli = [art('metro', 'ceci', 5000), art('conad', 'ceci', 400), art('altro', null)];
  const acquisti = [
    acq('a1', 'metro', '2026-10-20', 2, 10.5),   // 10 kg a 21 €  → 2,10 €/kg
    acq('a2', 'conad', '2026-10-01', 5, 1.36),   // 2 kg a 6,80 € → 3,40 €/kg
    acq('a3', 'metro', '2026-06-01', 1, 8),      // vecchio, fuori dai 60 giorni
    acq('a4', 'altro', '2026-11-01', 1, 99),     // non collegato
  ];

  it('media pesata di tutte le fonti negli ultimi 60 giorni, per grammo', () => {
    const p = prezzoIngrediente('ceci', articoli, acquisti, { finestraGiorni: 60, oggi: OGGI });
    expect(p.stato).toBe('recente');
    expect(p.acquisti).toBe(2);
    expect(p.ultimoAcquisto).toBe('2026-10-20');
    // (21 + 6,80) € / 12.000 g
    expect(p.prezzo!.times(1000).toFixed(6)).toBe('2.316667');
  });

  it('come VegMan Planner: tutti gli acquisti di sempre', () => {
    const p = prezzoIngrediente('ceci', articoli, acquisti, { finestraGiorni: null, oggi: OGGI });
    // (21 + 6,80 + 8) € / 17.000 g
    expect(p.prezzo!.times(1000).toFixed(6)).toBe('2.105882');
  });

  it('nessun acquisto recente: ultimo prezzo pagato, segnato «vecchio»', () => {
    const p = prezzoIngrediente('ceci', articoli, acquisti, { finestraGiorni: 60, oggi: '2027-03-01' });
    expect(p.stato).toBe('vecchio');
    expect(p.ultimoAcquisto).toBe('2026-10-20');
    expect(p.prezzo!.times(1000).toFixed(2)).toBe('2.10');
  });

  it('gli acquisti futuri rispetto alla data di riferimento non contano', () => {
    const p = prezzoIngrediente('ceci', articoli, acquisti, { finestraGiorni: null, oggi: '2026-07-01' });
    expect(p.acquisti).toBe(1);
    expect(p.prezzo!.times(1000).toFixed(2)).toBe('1.60');
  });

  it('nessun articolo collegato: prezzo mancante', () => {
    expect(prezzoIngrediente('farina', articoli, acquisti, { finestraGiorni: 60, oggi: OGGI }))
      .toEqual({ prezzo: null, stato: 'mancante', ultimoAcquisto: null, acquisti: 0 });
  });

  it('quantità totale zero: nessun prezzo', () => {
    const p = prezzoIngrediente('x', [art('z', 'x')], [acq('q', 'z', '2026-11-01', 0, 5)], { finestraGiorni: 60, oggi: OGGI });
    expect(p.prezzo).toBeNull();
  });
});

describe('food cost dei prodotti', () => {
  // Mayo: 4500 g olio + 1100 g aquafaba → resa 5600 g. Casciù: 1 panino + 40 g di Mayo.
  const ingredienti = [ing('olio'), ing('aquafaba'), ing('panino', 'Panino', 'pz'), ing('sale', 'Sale')];
  const articoli = [art('a-olio', 'olio', 1000), art('a-aqua', 'aquafaba', 1000), art('a-pan', 'panino', 15)];
  const acquisti = [acq('1', 'a-olio', '2026-10-10', 10, 3.2), acq('2', 'a-aqua', '2026-10-10', 5, 1.1), acq('3', 'a-pan', '2026-10-10', 4, 6)];
  const mayo = prod('mayo', [{ tipo: 'ingrediente', id: 'olio', quantita: 4500 }, { tipo: 'ingrediente', id: 'aquafaba', quantita: 1100 }],
    { tipo: 'semilavorato', prezzo: 0, resa: { quantita: 5600, unita: 'g' } });
  const casciu = prod('casciu', [{ tipo: 'ingrediente', id: 'panino', quantita: 1 }, { tipo: 'prodotto', id: 'mayo', quantita: 40 }]);
  const conSale = prod('salato', [{ tipo: 'ingrediente', id: 'panino', quantita: 1 }, { tipo: 'ingrediente', id: 'sale', quantita: 2 }, { tipo: 'prodotto', id: 'nulla', quantita: 1 }]);
  const r = foodCost({ ingredienti, prodotti: [mayo, casciu, conSale], articoli, acquisti }, { finestraGiorni: 60, oggi: OGGI });

  it('semilavorato: costo della ricetta intera e costo per unità di resa (€/kg)', () => {
    // Mayo intera = 4500×0,0032 + 1100×0,0011 = 14,40 + 1,21 = 15,61 € su 5600 g
    expect(r.prodotti.get('mayo')!.costo.toFixed(2)).toBe('15.61');
    expect(r.prodotti.get('mayo')!.costoUnitario.times(1000).toFixed(4)).toBe('2.7875');
  });

  it('vendibile: panino 0,40 € + 40 g di Mayo (0,1115 €) = 0,5115 €, 5,115% di 10 €', () => {
    const c = r.prodotti.get('casciu')!;
    expect(c.completo).toBe(true);
    expect(c.costo.toFixed(4)).toBe('0.5115');
    expect(c.percentuale!.toFixed(3)).toBe('5.115');
  });

  it('ingrediente senza prezzo o riferimento sparito: incompleto, con l\'elenco', () => {
    const c = r.prodotti.get('salato')!;
    expect(c.completo).toBe(false);
    expect(c.mancanti).toEqual(['Sale', '(semilavorato eliminato)']);
    expect(c.costo.toFixed(2)).toBe('0.40');
  });

  it('vendibile con resa di più pezzi: la percentuale usa il costo per pezzo', () => {
    const teglia = prod('teglia', [{ tipo: 'ingrediente', id: 'panino', quantita: 10 }], { prezzo: 5, resa: { quantita: 10, unita: 'pz' } });
    const x = foodCost({ ingredienti, prodotti: [teglia], articoli, acquisti }, { finestraGiorni: 60, oggi: OGGI }).prodotti.get('teglia')!;
    expect(x.costo.toFixed(2)).toBe('4.00');
    expect(x.costoUnitario.toFixed(2)).toBe('0.40');
    expect(x.percentuale!.toFixed(1)).toBe('8.0');
  });

  it('semilavorati senza prezzo di vendita: percentuale non calcolata', () => {
    expect(r.prodotti.get('mayo')!.percentuale).toBeNull();
  });

  it('ricette che si richiamano a vicenda non bloccano il calcolo', () => {
    const a = prod('a', [{ tipo: 'prodotto', id: 'b', quantita: 1 }, { tipo: 'ingrediente', id: 'panino', quantita: 1 }]);
    const b = prod('b', [{ tipo: 'prodotto', id: 'a', quantita: 1 }]);
    const m = { prodotti: new Map([['a', a], ['b', b]]), ingredienti: new Map(ingredienti.map((i) => [i.id, i])), prezzi: r.prezzi };
    expect(costoProdotto('a', m).costo.toFixed(2)).toBe('0.40');
    expect(costoProdotto('sconosciuto', m)).toMatchObject({ completo: false, mancanti: ['(prodotto eliminato)'] });
  });

  it('righe con quantità zero o senza riferimento si ignorano', () => {
    const p = prod('p', [{ tipo: 'ingrediente', id: 'panino', quantita: 0 }, { tipo: 'ingrediente', id: '', quantita: 3 }, { tipo: 'ingrediente', id: 'fantasma', quantita: 1 }]);
    const m = { prodotti: new Map([['p', p]]), ingredienti: new Map(ingredienti.map((i) => [i.id, i])), prezzi: r.prezzi };
    expect(costoProdotto('p', m)).toMatchObject({ completo: false, mancanti: ['(ingrediente eliminato)'] });
  });
});
