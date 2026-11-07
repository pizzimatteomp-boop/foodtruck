import type { Articolo, Prodotto } from '../foodcost/modello';
import { ErroreIngrediente, pianoUnione, preparaFattore, preparaIngrediente } from './operazioni';

describe('dati di un ingrediente', () => {
  it('ripulisce e accetta la virgola nella confezione', () => {
    expect(preparaIngrediente({ nome: ' Ceci ', categoria: 'alimentare', unita: ' g ', gruppo: ' Legumi ', confezione: '5000,5' }))
      .toEqual({ nome: 'Ceci', categoria: 'alimentare', unita: 'g', gruppo: 'Legumi', confezione: 5000.5 });
    expect(preparaIngrediente({ nome: 'Tovagliolo', categoria: 'packaging', unita: 'pz', confezione: '' }).confezione).toBeNull();
  });
  it('errori chiari', () => {
    const base = { nome: 'X', categoria: 'alimentare', unita: 'g' };
    expect(() => preparaIngrediente({ ...base, nome: ' ' })).toThrow('nome');
    expect(() => preparaIngrediente({ ...base, nome: 'x'.repeat(81) })).toThrow('lungo');
    expect(() => preparaIngrediente({ ...base, categoria: 'non_alimentare' })).toThrow('packaging');
    expect(() => preparaIngrediente({ ...base, unita: '' })).toThrow('unità');
    expect(() => preparaIngrediente({ ...base, confezione: -1 })).toThrow(ErroreIngrediente);
  });
  it('conversione: numero positivo, anche con la virgola', () => {
    expect(preparaFattore('1000')).toBe(1000);
    expect(preparaFattore('2,5')).toBe(2.5);
    expect(() => preparaFattore('0')).toThrow(ErroreIngrediente);
    expect(() => preparaFattore('abc')).toThrow(ErroreIngrediente);
  });
});

describe('unione di due ingredienti doppi', () => {
  const art = (id: string, ingrediente: string | null): Articolo => ({ id, nome: id, unita: 'KG', categoria: 'alimentare', ingrediente, fattore: 1000 });
  const prod = (id: string, ricetta: Prodotto['ricetta']): Prodotto =>
    ({ id, nome: id, tipo: 'vendibile', gruppo: '', prezzo: 5, resa: { quantita: 1, unita: 'pz' }, ricetta, quotaVendite: 0 });
  it('sposta gli articoli e aggiorna solo le ricette che lo usano', () => {
    const piano = pianoUnione('ceci2', 'ceci',
      [prod('hummus', [{ tipo: 'ingrediente', id: 'ceci2', quantita: 100 }, { tipo: 'prodotto', id: 'ceci2', quantita: 1 }]), prod('altro', [{ tipo: 'ingrediente', id: 'olio', quantita: 5 }])],
      [art('a1', 'ceci2'), art('a2', 'ceci'), art('a3', null)]);
    expect(piano.articoli).toEqual(['a1']);
    expect(piano.prodotti).toEqual([{ id: 'hummus', ricetta: [{ tipo: 'ingrediente', id: 'ceci', quantita: 100 }, { tipo: 'prodotto', id: 'ceci2', quantita: 1 }] }]);
  });
  it('non si unisce con sé stesso', () => {
    expect(() => pianoUnione('a', 'a', [], [])).toThrow('diverso');
  });
});

import { preparaEtichetta } from './operazioni';

describe('etichetta inserita a mano', () => {
  const base = { nomeEn: ' Soy  sauce ', composizioneIt: 'acqua,  *soia*, *frumento*, sale', composizioneEn: 'water, *soy*, *wheat*, salt', allergeni: ['soia', 'glutine', 'cioccolato'], tracce: ['sesamo', 'soia'], pesoUnitario: null, controllata: true };
  it('ripulisce, ordina gli allergeni, toglie dalle tracce quelli già presenti', () => {
    expect(preparaEtichetta(base, 'ml')).toEqual({
      nomeEn: 'Soy sauce', composizione: { it: 'acqua, *soia*, *frumento*, sale', en: 'water, *soy*, *wheat*, salt' },
      allergeni: ['glutine', 'soia'], tracce: ['sesamo'], pesoUnitario: null, controllata: true,
    });
  });
  it('peso per pezzo: obbligatorio per gli ingredienti a pezzi quando l\'etichetta è controllata', () => {
    expect(preparaEtichetta({ ...base, pesoUnitario: '100,5' }, 'pz').pesoUnitario).toBe(100.5);
    expect(() => preparaEtichetta(base, 'pz')).toThrow('grammi pesa 1 pz');
    expect(preparaEtichetta({ ...base, controllata: false }, 'pz').pesoUnitario).toBeNull();
    expect(preparaEtichetta({ ...base, pesoUnitario: 50 }, 'g').pesoUnitario).toBeNull();
    expect(() => preparaEtichetta({ ...base, pesoUnitario: '-1' }, 'pz')).toThrow('maggiore di zero');
  });
  it('asterischi spaiati e testi troppo lunghi', () => {
    expect(() => preparaEtichetta({ ...base, composizioneIt: 'acqua, *soia, sale' }, 'g')).toThrow('Asterischi');
    expect(() => preparaEtichetta({ ...base, composizioneEn: 'x'.repeat(1001) }, 'g')).toThrow('lunga');
  });
});
