import type { Acquisto, Articolo, Ingrediente, Prodotto } from '../foodcost/modello';
import {
  andamentoFoodCost, avvisiFoodCost, fineMese, fotografia, fotografiaDaSalvare, meseSpostato, mesiTra, nomeMese, prezziMensili, variazione,
} from './storico';

const ing = (id: string, nome: string, unita = 'g'): Ingrediente => ({ id, nome, categoria: 'alimentare', unita, gruppo: '', confezione: null });
const art = (id: string, ingrediente: string, fattore = 1000): Articolo => ({ id, nome: id, unita: 'KG', categoria: 'alimentare', ingrediente, fattore });
const acq = (id: string, articolo: string, data: string, quantita: number, prezzoUnitario: number): Acquisto =>
  ({ id, data, fornitore: 'F', descrizione: '', articolo, quantita, unita: 'KG', prezzoUnitario, fattura: null, origine: 'fattura' });
const prod = (id: string, ricetta: Prodotto['ricetta'], o: Partial<Prodotto> = {}): Prodotto =>
  ({ id, nome: id, tipo: 'vendibile', gruppo: '', prezzo: 10, resa: { quantita: 1, unita: 'pz' }, ricetta, quotaVendite: 0, ...o });

// Ceci: settembre 2 €/kg, ottobre 2 €/kg (Metro) e 3 €/kg (Conad), novembre 3 €/kg
const ingredienti = [ing('ceci', 'Ceci'), ing('sale', 'Sale'), ing('tahina', 'Tahina')];
const articoli = [art('metro', 'ceci'), art('conad', 'ceci'), art('a-sale', 'sale')];
const acquisti = [
  acq('1', 'metro', '2026-09-10', 10, 2), acq('2', 'metro', '2026-10-05', 10, 2), acq('3', 'conad', '2026-10-20', 10, 3),
  acq('4', 'metro', '2026-11-03', 10, 3), acq('5', 'a-sale', '2026-06-01', 1, 1),
];
const hummus = prod('hummus', [{ tipo: 'ingrediente', id: 'ceci', quantita: 1000 }, { tipo: 'ingrediente', id: 'tahina', quantita: 10 }], { soglia: 20, inMenu: true });
const dati = { ingredienti, prodotti: [hummus], articoli, acquisti };

describe('mesi', () => {
  it('fine mese, spostamenti, intervalli, nomi', () => {
    expect(fineMese('2026-02')).toBe('2026-02-28');
    expect(fineMese('2024-02')).toBe('2024-02-29');
    expect(fineMese('2026-12')).toBe('2026-12-31');
    expect(meseSpostato('2026-01', -1)).toBe('2025-12');
    expect(meseSpostato('2026-11', 2)).toBe('2027-01');
    expect(mesiTra('2026-10', '2027-01')).toEqual(['2026-10', '2026-11', '2026-12', '2027-01']);
    expect(mesiTra('2026-10', '2026-09')).toEqual([]);
    expect(nomeMese('2026-10')).toBe('ott 26');
    expect(nomeMese('2026-10', true)).toBe('ottobre 2026');
  });
});

describe('prezzo pagato mese per mese', () => {
  it('media pesata del mese, totale e per fonte; mesi senza acquisti vuoti', () => {
    const p = prezziMensili('ceci', articoli, acquisti, ['2026-08', '2026-09', '2026-10', '2026-11']);
    expect(p.map((x) => x.prezzo === null ? null : +(x.prezzo * 1000).toFixed(3))).toEqual([null, 2, 2.5, 3]);
    expect(Object.fromEntries(Object.entries(p[2]!.perFonte).map(([k, v]) => [k, v * 1000]))).toEqual({ metro: 2, conad: 3 });
  });
  it('variazione %', () => {
    expect(variazione(2, 3)).toBe(50);
    expect(variazione(null, 3)).toBeNull();
    expect(variazione(2, null)).toBeNull();
    expect(variazione(0, 1)).toBeNull();
  });
});

describe('fotografia mensile', () => {
  it('prezzi (media 60 giorni a fine mese) e food cost dei prodotti in vendita', () => {
    const f = fotografia('2026-10', dati);
    // a fine ottobre, ultimi 60 giorni: 10 kg a 2 + 10 kg a 2 + 10 kg a 3 = 70 € / 30 kg
    expect(f.ingredienti.ceci!.prezzo! * 1000).toBeCloseTo(2.3333, 4);
    expect(f.ingredienti.tahina).toEqual({ nome: 'Tahina', unita: 'g', prezzo: null, stato: 'mancante' });
    expect(f.ingredienti.sale!.stato).toBe('vecchio');
    expect(f.prodotti.hummus).toMatchObject({ nome: 'hummus', prezzo: 10, completo: false });
    expect(f.prodotti.hummus!.percentuale).toBeCloseTo(23.333, 3);
  });
  it('si salva il mese scorso, una volta sola, solo se ci sono acquisti fino ad allora', () => {
    expect(fotografiaDaSalvare('2026-11-07', new Set(), acquisti)).toBe('2026-10');
    expect(fotografiaDaSalvare('2026-11-07', new Set(['2026-10']), acquisti)).toBeNull();
    expect(fotografiaDaSalvare('2026-03-01', new Set(), acquisti)).toBeNull();
  });
});

describe('andamento del food cost', () => {
  it('fotografie dove ci sono, ricalcolo dove mancano, oggi alla fine', () => {
    const fot = new Map([['2026-09', { mese: '2026-09', ingredienti: {}, prodotti: { hummus: { nome: 'h', prezzo: 10, costo: 1.9, percentuale: 19, completo: true } } }]]);
    const a = andamentoFoodCost('hummus', ['2026-09', '2026-10', '2026-11'], fot, dati, '2026-11-07');
    expect(a.map((x) => [x.mese, x.origine, x.percentuale === null ? null : +x.percentuale.toFixed(2)])).toEqual([
      ['2026-09', 'fotografia', 19], ['2026-10', 'ricalcolato', 23.33], ['2026-11', 'oggi', 25], // 7/11: 60 giorni dall'8/9 → 100 € / 40 kg
    ]);
  });
});

describe('avvisi', () => {
  it('soglia superata, rincari oltre la %, ingredienti in menu senza prezzo o con prezzo vecchio', () => {
    const conSale = { ...dati, prodotti: [{ ...hummus, ricetta: [...hummus.ricetta, { tipo: 'ingrediente' as const, id: 'sale', quantita: 5 }] }] };
    const a = avvisiFoodCost(conSale, '2026-11-07', 5);
    expect(a.map((x) => x.tipo)).toEqual(['soglia', 'rincaro', 'senza-prezzo', 'prezzo-vecchio']);
    expect(a[0]!.testo).toBe('hummus: food cost 25,1% (soglia 20%)'); // + 5 g di sale (0,005 €)
    // da 2,333 €/kg (fine ottobre) a 2,50 €/kg (oggi)
    expect(a[1]!.testo).toBe('Ceci: +7% rispetto alla fine del mese scorso');
    expect(a[2]!.testo).toBe('Tahina: senza prezzo, usato nei prodotti in menu');
    expect(a[3]!.testo).toBe('Sale: prezzo vecchio (ultimo acquisto 01/06/2026)');
    expect(a[1]!.link).toBe('#/ingredienti/ceci');
  });
  it('rincaro sotto la soglia o prodotto non in menu: nessun avviso', () => {
    const tranquillo = { ...dati, prodotti: [{ ...hummus, inMenu: false, soglia: null }] };
    expect(avvisiFoodCost(tranquillo, '2026-11-07', 10)).toEqual([]);
  });
});
