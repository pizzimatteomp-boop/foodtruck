import { describe, expect, it } from 'vitest';
import type { Acquisto, Articolo, Ingrediente, Prodotto } from '../foodcost/modello';
import { vociMagazzino } from './inventario';
import { confronto, eventi, mezzogiorno, scomponi, stockTeorico, type InventarioConOra } from './stock';

const ING: Ingrediente[] = [
  { id: 'olio', nome: 'Olio', categoria: 'alimentare', unita: 'ml', gruppo: '', confezione: 5000 },
  { id: 'soia', nome: 'Latte di soia', categoria: 'alimentare', unita: 'ml', gruppo: '', confezione: 1000 },
  { id: 'pane', nome: 'Pane', categoria: 'alimentare', unita: 'pz', gruppo: '', confezione: null },
  { id: 'vasc', nome: 'Vaschetta', categoria: 'packaging', unita: 'pz', gruppo: '', confezione: null },
];
const P = (x: Partial<Prodotto> & Pick<Prodotto, 'id' | 'tipo' | 'resa' | 'ricetta'>): Prodotto => ({ nome: x.id, gruppo: '', prezzo: 0, quotaVendite: 0, ...x });
const PRO = new Map([
  // Mayo: 1000 g da 800 ml olio + 200 ml soia
  ['mayo', P({ id: 'mayo', tipo: 'semilavorato', resa: { quantita: 1000, unita: 'g' }, ricetta: [{ tipo: 'ingrediente', id: 'olio', quantita: 800 }, { tipo: 'ingrediente', id: 'soia', quantita: 200 }] })],
  // Panino: 1 pane + 50 g mayo + 1 vaschetta
  ['panino', P({ id: 'panino', tipo: 'vendibile', resa: { quantita: 1, unita: 'pz' }, ricetta: [{ tipo: 'ingrediente', id: 'pane', quantita: 1 }, { tipo: 'prodotto', id: 'mayo', quantita: 50 }, { tipo: 'ingrediente', id: 'vasc', quantita: 1 }, { tipo: 'ingrediente', id: '', quantita: 1 }] })],
  // Menu: un panino (vendibile dentro un vendibile) + 1 vaschetta
  ['menu', P({ id: 'menu', tipo: 'vendibile', resa: { quantita: 1, unita: 'pz' }, ricetta: [{ tipo: 'prodotto', id: 'panino', quantita: 1 }, { tipo: 'ingrediente', id: 'vasc', quantita: 1 }] })],
]);
const VOCI = vociMagazzino(ING, [...PRO.values()], new Map());
const ART: Articolo[] = [{ id: 'a-olio', nome: 'OLIO 5 L', unita: 'PZ', categoria: 'alimentare', ingrediente: 'olio', fattore: 5000 }, { id: 'a-x', nome: 'X', unita: 'PZ', categoria: null, ingrediente: null, fattore: 1 }];
const acq = (data: string, articolo: string, quantita: number): Acquisto => ({ id: data + articolo, data, fornitore: 'F', descrizione: '', articolo, quantita, unita: 'PZ', prezzoUnitario: 1, fattura: null, origine: 'fattura' });
const T = (g: string, h = 18) => Date.parse(`${g}T${String(h - 1).padStart(2, '0')}:00:00Z`);

describe('stock teorico del magazzino', () => {
  it('scompone le ricette: i semilavorati escono come tali, i vendibili dentro altri vendibili si aprono', () => {
    expect(Object.fromEntries(scomponi('panino', 10, PRO))).toEqual({ 'ingrediente-pane': 10, 'semilavorato-mayo': 500, 'ingrediente-vasc': 10 });
    expect(Object.fromEntries(scomponi('menu', 2, PRO))).toEqual({ 'ingrediente-pane': 2, 'semilavorato-mayo': 100, 'ingrediente-vasc': 4 });
    expect(Object.fromEntries(scomponi('mayo', 500, PRO))).toEqual({ 'ingrediente-olio': 400, 'ingrediente-soia': 100 });
    expect(scomponi('sconosciuto', 1, PRO).size).toBe(0);
    const giro = new Map([['a', P({ id: 'a', tipo: 'vendibile', resa: { quantita: 0, unita: 'pz' }, ricetta: [{ tipo: 'prodotto', id: 'a', quantita: 1 }] })]]);
    expect(scomponi('a', 1, giro).size).toBe(0);
  });

  it('inventario + acquisti + produzione − vendite − senza incasso = teorico; voci mai contate senza teorico', () => {
    const inv1: InventarioConOra = { ms: T('2026-11-01'), giorno: '2026-11-01', righe: [
      { tipo: 'ingrediente', id: 'olio', quantita: 10000 }, { tipo: 'ingrediente', id: 'soia', quantita: 2000 },
      { tipo: 'ingrediente', id: 'pane', quantita: 100 }, { tipo: 'semilavorato', id: 'mayo', quantita: 0 },
    ] };
    const ev = eventi({
      prodotti: PRO, articoli: ART,
      acquisti: [acq('2026-11-01', 'a-olio', 9), acq('2026-11-03', 'a-olio', 2), acq('2026-11-03', 'a-x', 5), acq('2026-11-04', 'manca', 1)],
      produzioni: [{ prodotto: 'mayo', quantita: 2000, ms: T('2026-11-05', 10) }],
      uscite: [
        { prodotto: 'panino', quantita: 30, ms: T('2026-11-07', 20), causa: 'vendita' },
        { prodotto: 'mayo', quantita: 100, ms: T('2026-11-07', 21), causa: 'senza incasso' },
        { prodotto: 'eliminato', quantita: 1, ms: T('2026-11-07', 21), causa: 'vendita' },
      ],
    });
    const s = Object.fromEntries(stockTeorico(VOCI, [inv1], ev, T('2026-11-10')).map((x) => [x.chiave, x]));
    // olio: 10000 + 2×5000 (l'acquisto del 1/11 alle 12 è prima dell'inventario delle 18: già contato) − 1600 per la mayo
    expect(s['ingrediente-olio']).toMatchObject({ entrate: 10000, uscite: 1600, teorico: 18400 });
    expect(s['ingrediente-soia']!.teorico).toBe(1600);
    expect(s['semilavorato-mayo']).toMatchObject({ entrate: 2000, uscite: 1600, teorico: 400 });
    expect(s['ingrediente-pane']!.teorico).toBe(70);
    expect(s['ingrediente-vasc']).toMatchObject({ base: null, teorico: null, uscite: 30 });
    // prima della produzione la mayo è a zero
    expect(stockTeorico(VOCI, [inv1], ev, T('2026-11-04')).find((x) => x.chiave === 'semilavorato-mayo')!.teorico).toBe(0);
  });

  it('confronto: contato contro atteso dall\'inventario precedente; il più recente vale come nuova base', () => {
    const inv1: InventarioConOra = { ms: T('2026-11-01'), giorno: '2026-11-01', righe: [{ tipo: 'ingrediente', id: 'pane', quantita: 100 }, { tipo: 'ingrediente', id: 'soia', quantita: 0 }] };
    const inv2: InventarioConOra = { ms: T('2026-11-10'), giorno: '2026-11-10', righe: [
      { tipo: 'ingrediente', id: 'pane', quantita: 65 }, { tipo: 'ingrediente', id: 'vasc', quantita: 40 }, { tipo: 'ingrediente', id: 'soia', quantita: 5 },
      { tipo: 'ingrediente', id: 'sparito', quantita: 1 },
    ] };
    const ev = eventi({ prodotti: PRO, articoli: ART, acquisti: [], produzioni: [], uscite: [{ prodotto: 'panino', quantita: 30, ms: T('2026-11-05'), causa: 'vendita' }] });
    expect(confronto(VOCI, [inv1, inv2], ev, inv2)).toEqual([
      { chiave: 'ingrediente-soia', nome: 'Latte di soia', unita: 'ml', atteso: 0, contato: 5, differenza: 5, percentuale: null },
      { chiave: 'ingrediente-pane', nome: 'Pane', unita: 'pz', atteso: 70, contato: 65, differenza: -5, percentuale: -7.1 },
    ]);
    const dopo = stockTeorico(VOCI, [inv1, inv2], ev, T('2026-11-12'));
    expect(dopo.find((x) => x.chiave === 'ingrediente-pane')).toMatchObject({ base: { giorno: '2026-11-10', quantita: 65 }, teorico: 65 });
    expect(mezzogiorno('2026-11-01')).toBe(Date.parse('2026-11-01T11:00:00Z'));
  });
});
