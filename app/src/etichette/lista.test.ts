import type { Etichetta, Ingrediente, Prodotto } from '../foodcost/modello';
import { ALLERGENI, eAllergene, nomeAllergene, ordinaAllergeni } from './allergeni';
import { listaIngredienti, riepilogoAllergeni, segmentiComposizione, segmentiLista } from './lista';

const et = (x: Partial<Etichetta> = {}): Etichetta => ({ nomeEn: '', composizione: { it: '', en: '' }, allergeni: [], tracce: [], pesoUnitario: null, controllata: true, ...x });
const ing = (id: string, nome: string, unita: string, etichetta?: Etichetta, categoria: Ingrediente['categoria'] = 'alimentare'): Ingrediente =>
  ({ id, nome, categoria, unita, gruppo: '', confezione: null, ...(etichetta ? { etichetta } : {}) });
const prod = (id: string, nome: string, ricetta: Prodotto['ricetta'], o: Partial<Prodotto> = {}): Prodotto =>
  ({ id, nome, tipo: 'vendibile', gruppo: '', prezzo: 12, resa: { quantita: 1, unita: 'pz' }, ricetta, quotaVendite: 0, ...o });

// Dati inventati, non le ricette vere.
const ingredienti = [
  ing('pita', 'Pita', 'pz', et({ nomeEn: 'Pita bread', composizione: { it: 'farina di *frumento*, acqua, sale', en: '*wheat* flour, water, salt' }, allergeni: ['glutine'], tracce: ['sesamo', 'soia'], pesoUnitario: 90 })),
  ing('seitan', 'Seitan', 'g', et({ nomeEn: 'Seitan', allergeni: ['glutine'] })),
  ing('cavolo', 'Cavolo cappuccio', 'g', et({ nomeEn: 'White cabbage' })),
  ing('olio', 'Olio di semi di girasole', 'ml', et({ nomeEn: 'Sunflower oil' })),
  ing('aquafaba', 'Aquafaba', 'g', et({ nomeEn: 'Aquafaba', composizione: { it: 'acqua di cottura dei ceci', en: '' } })),
  ing('senape', 'Senape', 'g', et({ nomeEn: 'Mustard', composizione: { it: 'acqua, semi di *senape*, aceto', en: 'water, *mustard* seeds, vinegar' }, allergeni: ['senape', 'solfiti'] })),
  ing('salsa-soia', 'Salsa di soia', 'ml'),
  ing('tovagliolo', 'Tovagliolo', 'pz', undefined, 'packaging'),
];
const mayo = prod('mayo', 'Mayo veg', [
  { tipo: 'ingrediente', id: 'olio', quantita: 800 }, { tipo: 'ingrediente', id: 'aquafaba', quantita: 150 }, { tipo: 'ingrediente', id: 'senape', quantita: 50 },
], { tipo: 'semilavorato', prezzo: 0, resa: { quantita: 1000, unita: 'g' }, nomeEn: 'Vegan mayo' });
const kebab = prod('kebab', 'Kebab', [
  { tipo: 'ingrediente', id: 'pita', quantita: 1 },          // 90 g
  { tipo: 'ingrediente', id: 'seitan', quantita: 120 },
  { tipo: 'ingrediente', id: 'cavolo', quantita: 40 },
  { tipo: 'prodotto', id: 'mayo', quantita: 40 },             // 40 g di mayo: 32 olio, 6 aquafaba, 2 senape
  { tipo: 'ingrediente', id: 'cavolo', quantita: 20 },        // stesso ingrediente due volte: si sommano (60 g)
  { tipo: 'ingrediente', id: 'tovagliolo', quantita: 1 },     // packaging: escluso
], { nomeEn: 'Kebab' });
const dati = { prodotti: new Map([mayo, kebab].map((p) => [p.id, p])), ingredienti: new Map(ingredienti.map((i) => [i.id, i])) };

describe('allergeni', () => {
  it('14 allergeni di legge, in ordine ufficiale, nomi IT/EN', () => {
    expect(ALLERGENI).toHaveLength(14);
    expect(ordinaAllergeni(['soia', 'glutine', 'soia'])).toEqual(['glutine', 'soia']);
    expect(nomeAllergene('glutine', 'it')).toBe('cereali contenenti glutine');
    expect(nomeAllergene('sesamo', 'en', true)).toBe('sesame');
    expect(eAllergene('latte')).toBe(true);
    expect(eAllergene('cioccolato')).toBe(false);
  });
});

describe('lista ingredienti di un prodotto', () => {
  const l = listaIngredienti('kebab', dati);

  it('ordine di peso: seitan 120, pita 90, cavolo 60 (sommato), mayo 40; packaging escluso', () => {
    expect(l.voci.map((v) => [v.nome.it, v.peso])).toEqual([['Seitan', 120], ['Pita', 90], ['Cavolo cappuccio', 60], ['Mayo veg', 40]]);
    const m = l.voci.find((v) => v.id === 'mayo')!;
    expect(m.componenti.map((c) => [c.nome.it, Math.round(c.peso! * 10) / 10])).toEqual([['Olio di semi di girasole', 32], ['Aquafaba', 6], ['Senape', 2]]);
  });

  it('testo in italiano: composti tra parentesi, allergeni in grassetto', () => {
    const s = segmentiLista(l.voci, 'it');
    expect(s.map((x) => x.testo).join('')).toBe('Seitan, Pita (farina di frumento, acqua, sale), Cavolo cappuccio, Mayo veg (Olio di semi di girasole, Aquafaba (acqua di cottura dei ceci), Senape (acqua, semi di senape, aceto))');
    expect(s.filter((x) => x.grassetto).map((x) => x.testo)).toEqual(['Seitan', 'frumento', 'senape']);
  });

  it('testo in inglese, con la composizione italiana se manca quella inglese (e lo segnala)', () => {
    expect(segmentiLista(l.voci, 'en').map((x) => x.testo).join('')).toBe('Seitan, Pita bread (wheat flour, water, salt), White cabbage, Vegan mayo (Sunflower oil, Aquafaba (acqua di cottura dei ceci), Mustard (water, mustard seeds, vinegar))');
    expect(l.problemi.en).toEqual(['«Aquafaba»: manca la composizione in inglese']);
  });

  it('contiene e può contenere (le tracce già presenti come allergeni non si ripetono)', () => {
    expect(l.allergeni).toEqual(['glutine', 'senape', 'solfiti']);
    expect(l.tracce).toEqual(['soia', 'sesamo']);
    expect(riepilogoAllergeni(l, 'it')).toEqual({ contiene: 'cereali contenenti glutine, senape, anidride solforosa e solfiti', puoContenere: 'soia, semi di sesamo' });
    expect(riepilogoAllergeni(l, 'en').contiene).toBe('cereals containing gluten, mustard, sulphur dioxide and sulphites');
    expect(l.problemi.it).toEqual([]);
  });

  it('dati mancanti: etichetta non controllata, pezzo senza peso, nome inglese, riferimenti spariti', () => {
    const d = {
      prodotti: new Map([['p', prod('p', 'Prova', [
        { tipo: 'ingrediente', id: 'salsa-soia', quantita: 10 },
        { tipo: 'ingrediente', id: 'pz', quantita: 2 },
        { tipo: 'ingrediente', id: 'nonce', quantita: 1 },
        { tipo: 'prodotto', id: 'sparito', quantita: 1 },
        { tipo: 'ingrediente', id: 'seitan', quantita: 0 },
      ])]]),
      ingredienti: new Map([
        ['salsa-soia', ing('salsa-soia', 'Salsa di soia', 'ml')],
        ['pz', ing('pz', 'Panino', 'pz', et({ nomeEn: '', controllata: false }))],
      ]),
    };
    const x = listaIngredienti('p', d);
    expect(x.problemi.it).toEqual([
      '«Salsa di soia»: etichetta da controllare', '«Panino»: etichetta da controllare', '«Panino»: manca il peso per pezzo',
      'un ingrediente della ricetta non esiste più', 'un semilavorato della ricetta non esiste più',
    ]);
    expect(x.problemi.en).toEqual(['«Prova»: manca il nome in inglese', '«Panino»: manca il nome in inglese']);
    expect(x.voci.map((v) => [v.nome.it, v.peso])).toEqual([['Salsa di soia', 10], ['Panino', null]]);
    expect(listaIngredienti('niente', d).problemi.it).toEqual(['prodotto non trovato']);
  });

  it('semilavorato con resa in pezzi: peso dalla somma dei suoi ingredienti; ricette circolari fermate', () => {
    const base = prod('base', 'Base', [{ tipo: 'ingrediente', id: 'seitan', quantita: 200 }, { tipo: 'prodotto', id: 'p2', quantita: 1 }], { tipo: 'semilavorato', resa: { quantita: 2, unita: 'pz' } });
    const p2 = prod('p2', 'Due', [{ tipo: 'prodotto', id: 'base', quantita: 1 }, { tipo: 'prodotto', id: 'base', quantita: 1 }]);
    const x = listaIngredienti('p2', { prodotti: new Map([['base', base], ['p2', p2]]), ingredienti: dati.ingredienti });
    expect(x.voci).toHaveLength(1);
    expect(x.voci[0]!.peso).toBe(200); // 2 × (1/2 × 200 g)
    expect(x.voci[0]!.componenti.map((c) => c.peso)).toEqual([200]);
  });

  it('kg e litri convertiti in grammi', () => {
    const d = { prodotti: new Map([['p', prod('p', 'P', [{ tipo: 'ingrediente', id: 'a', quantita: 0.2 }, { tipo: 'ingrediente', id: 'b', quantita: 0.1 }, { tipo: 'ingrediente', id: 'c', quantita: 15 }])]]),
      ingredienti: new Map([['a', ing('a', 'Riso', 'kg', et())], ['b', ing('b', 'Latte di avena', 'l', et())], ['c', ing('c', 'Aceto', 'cl', et())]]) };
    expect(listaIngredienti('p', d).voci.map((v) => [v.nome.it, v.peso])).toEqual([['Riso', 200], ['Aceto', 150], ['Latte di avena', 100]]);
  });
});

describe('composizione con gli allergeni tra asterischi', () => {
  it('grassetto sulle parole tra asterischi; asterischi spaiati tolti', () => {
    expect(segmentiComposizione('acqua, *soia*, *frumento*, sale')).toEqual([
      { testo: 'acqua, ', grassetto: false }, { testo: 'soia', grassetto: true }, { testo: ', ', grassetto: false },
      { testo: 'frumento', grassetto: true }, { testo: ', sale', grassetto: false },
    ]);
    expect(segmentiComposizione('acqua*, sale')).toEqual([{ testo: 'acqua, sale', grassetto: false }]);
  });
});
