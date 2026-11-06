import { ErroreImport, leggiPlanner } from './planner';

const BACKUP = {
  ingredients: [
    { id: 'i-pan', name: 'Panino 100 g', category: 'Burger', type: 'consumable', unit: 'pz', packageSize: 15, priceArticleId: 'a-pan', priceFactor: 15 },
    { id: 'i-olio', name: 'Olio di semi', category: 'Salse', unit: 'g' },
    { id: 'bad id!', name: 'Rotto' },
  ],
  products: [
    { id: 'p-mayo', name: 'Mayo veg', kind: 'component', category: 'Salse', yieldQty: 5600, yieldUnit: 'g', price: 0, pct: 0,
      recipe: [{ refType: 'ingredient', refId: 'i-olio', qty: 4500 }] },
    { id: 'p-cas', name: 'Casciù', kind: 'sellable', category: 'Burger', price: 10, pct: 23.5, yieldQty: 1, yieldUnit: 'pz',
      recipe: [{ refType: 'ingredient', refId: 'i-pan', qty: 1 }, { refType: 'product', refId: 'p-mayo', qty: 40 }, { ingredientId: 'i-olio', qty: '5' }, { refType: 'ingredient', refId: 'i-zero', qty: 0 }] },
    { id: 'p-bbq', name: 'BBQ', kind: 'component', yieldQty: 1, yieldUnit: 'g', recipe: [] },
    { id: 'p-x', name: 'Rotto', kind: 'sellable', recipe: [{ refType: 'product', refId: 'p-sparito', qty: 1 }] },
  ],
  purchases: [
    { id: 'r1', invoiceId: 'f1', date: '2026-05-14', supplier: 'METRO', invoiceNumber: '3341/FD', description: 'PANINI', qty: 3, unit: 'CO', unitPrice: 13.8, articleId: 'a-pan' },
    { id: 'r2', date: '2026-05-14T10:00:00Z', supplier: 'CONAD', description: 'OLIO', qty: '2', unit: 'LT', unitPrice: '4,5' },
    { id: 'r3', date: 'ieri', description: 'Senza data' },
  ],
  priceArticles: [{ id: 'a-pan', name: 'PANINI 15 PZ', unit: 'CO' }, { id: 'a-olio', name: 'OLIO 1 LT', unit: 'LT' }],
  events: [{ id: 'e1' }], salesHistory: [{ id: 's1', customerName: 'Henry' }],
};

describe('import da VegMan Planner', () => {
  const r = leggiPlanner(JSON.stringify(BACKUP));

  it('ingredienti con unità, gruppo e confezione; codici non validi saltati', () => {
    expect(r.ingredienti.map((i) => i.id)).toEqual(['i-pan', 'i-olio']);
    expect(r.ingredienti[0]).toEqual({ id: 'i-pan', nome: 'Panino 100 g', categoria: 'alimentare', unita: 'pz', gruppo: 'Burger', confezione: 15 });
    expect(r.ingredienti[1]!.confezione).toBeNull();
  });

  it('prodotti e semilavorati con ricette (anche nel formato vecchio di Planner)', () => {
    const cas = r.prodotti.find((p) => p.id === 'p-cas')!;
    expect(cas).toMatchObject({ tipo: 'vendibile', prezzo: 10, quotaVendite: 23.5, resa: { quantita: 1, unita: 'pz' } });
    expect(cas.ricetta).toEqual([
      { tipo: 'ingrediente', id: 'i-pan', quantita: 1 },
      { tipo: 'prodotto', id: 'p-mayo', quantita: 40 },
      { tipo: 'ingrediente', id: 'i-olio', quantita: 5 },
    ]);
    expect(r.prodotti.find((p) => p.id === 'p-mayo')).toMatchObject({ tipo: 'semilavorato', prezzo: 0, resa: { quantita: 5600, unita: 'g' } });
  });

  it('articoli collegati all\'ingrediente con il fattore di conversione', () => {
    expect(r.articoli).toEqual([
      { id: 'a-pan', nome: 'PANINI 15 PZ', unita: 'CO', categoria: 'alimentare', ingrediente: 'i-pan', fattore: 15 },
      { id: 'a-olio', nome: 'OLIO 1 LT', unita: 'LT', categoria: null, ingrediente: null, fattore: 1 },
    ]);
  });

  it('acquisti con fattura, numeri con la virgola, date ripulite; senza data saltati', () => {
    expect(r.acquisti).toEqual([
      { id: 'r1', data: '2026-05-14', fornitore: 'METRO', descrizione: 'PANINI', articolo: 'a-pan', quantita: 3, unita: 'CO', prezzoUnitario: 13.8, fattura: { numero: '3341/FD', id: 'f1' }, origine: 'planner' },
      { id: 'r2', data: '2026-05-14', fornitore: 'CONAD', descrizione: 'OLIO', articolo: null, quantita: 2, unita: 'LT', prezzoUnitario: 4.5, fattura: null, origine: 'planner' },
    ]);
  });

  it('non importa eventi né comande storiche', () => {
    expect(Object.keys(r).sort()).toEqual(['acquisti', 'articoli', 'avvisi', 'ingredienti', 'prodotti']);
    expect(JSON.stringify(r)).not.toContain('Henry');
  });

  it('avvisi in parole semplici su ciò che va sistemato', () => {
    expect(r.avvisi).toEqual([
      'Ingrediente senza codice valido saltato: «Rotto».',
      '«BBQ» ha la ricetta vuota.',
      '«Rotto» usa un semilavorato che non esiste più.',
      'Acquisto «Senza data» senza data valida saltato.',
      '1 riga di fattura non è collegata a nessun articolo.',
      '1 ingrediente su 2 non ha ancora un prezzo (nessun articolo collegato).',
    ]);
  });

  it('file sbagliati: messaggio chiaro', () => {
    expect(() => leggiPlanner('non json')).toThrow(ErroreImport);
    expect(() => leggiPlanner('{"a":1}')).toThrow('mancano ingredienti e prodotti');
    expect(() => leggiPlanner(null)).toThrow(ErroreImport);
  });

  it('plurali corretti con più righe e più ingredienti', () => {
    const x = leggiPlanner({ ...BACKUP, ingredients: [...BACKUP.ingredients, { id: 'i-tre', name: 'Tre' }],
      purchases: [...BACKUP.purchases, { id: 'r4', date: '2026-05-15', description: 'X', qty: 1, unitPrice: 1 }] });
    expect(x.avvisi).toContain('2 righe di fattura non sono collegate a nessun articolo.');
    expect(x.avvisi).toContain('2 ingredienti su 3 non hanno ancora un prezzo (nessun articolo collegato).');
  });

  it('un articolo collegato a due ingredienti: tenuto il primo, con avviso', () => {
    const x = leggiPlanner({ ...BACKUP, ingredients: [...BACKUP.ingredients, { id: 'i-due', name: 'Doppio', priceArticleId: 'a-pan' }] });
    expect(x.articoli[0]!.ingrediente).toBe('i-pan');
    expect(x.avvisi.some((a) => a.includes('più ingredienti'))).toBe(true);
  });
});
