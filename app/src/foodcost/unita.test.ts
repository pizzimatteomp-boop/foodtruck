import BigNumber from 'bignumber.js';
import { fattoreSuggerito, prezzoMostrato } from './unita';
import { somiglianza, suggerimenti } from './somiglianza';

describe('prezzo mostrato', () => {
  it('grammi → €/kg, ml → €/L, pezzi → €/pz', () => {
    expect(prezzoMostrato(new BigNumber('0.0021'), 'g')).toEqual({ valore: new BigNumber('2.1'), per: 'kg' });
    expect(prezzoMostrato(new BigNumber('0.003'), 'ml')).toEqual({ valore: new BigNumber('3'), per: 'L' });
    expect(prezzoMostrato(new BigNumber('0.4'), 'pz')).toEqual({ valore: new BigNumber('0.4'), per: 'pz' });
    expect(prezzoMostrato(new BigNumber('1'), '')).toMatchObject({ per: 'unità' });
  });
});

describe('conversione proposta tra articolo e ingrediente', () => {
  it('unità compatibili', () => {
    expect(fattoreSuggerito({ unita: 'KG', nome: 'Ceci' }, 'g')).toBe(1000);
    expect(fattoreSuggerito({ unita: 'LT', nome: 'Olio' }, 'ml')).toBe(1000);
    expect(fattoreSuggerito({ unita: 'kg', nome: 'Farina' }, 'kg')).toBe(1);
    expect(fattoreSuggerito({ unita: 'pz', nome: 'Pita' }, 'pz')).toBe(1);
  });
  it('quantità scritta nel nome dell\'articolo', () => {
    expect(fattoreSuggerito({ unita: 'PZ', nome: 'CECI SECCHI 5 KG' }, 'g')).toBe(5000);
    expect(fattoreSuggerito({ unita: 'CO', nome: 'PASSATA 700 GR' }, 'g')).toBe(700);
    expect(fattoreSuggerito({ unita: 'CO', nome: 'LATTE AVENA 1,5 LT' }, 'ml')).toBe(1500);
    expect(fattoreSuggerito({ unita: 'CT', nome: 'BIBITA 33 CL' }, 'ml')).toBe(330);
    expect(fattoreSuggerito({ unita: 'CO', nome: 'PANINI X15' }, 'pz')).toBe(15);
    expect(fattoreSuggerito({ unita: 'CO', nome: 'TOVAGLIOLI 500 PZ' }, 'pz')).toBe(500);
    expect(fattoreSuggerito({ unita: 'CO', nome: 'RISO 2 KG' }, 'kg')).toBe(2);
    expect(fattoreSuggerito({ unita: 'CO', nome: 'ACETO 500 ML' }, 'l')).toBe(0.5);
  });
  it('niente di riconoscibile: 1, da correggere a mano', () => {
    expect(fattoreSuggerito({ unita: 'CO', nome: 'WAMI NATURALE' }, 'pz')).toBe(1);
    expect(fattoreSuggerito({ unita: 'CO', nome: 'PANINI X15' }, 'g')).toBe(1);
  });
});

describe('somiglianza dei nomi', () => {
  it('uguali, contenuti, parole in comune, con la stessa radice', () => {
    expect(somiglianza('Ceci', 'ceci')).toBe(100);
    expect(somiglianza('Ceci', 'CECI SECCHI 5 KG')).toBe(80);
    expect(somiglianza('Pomodori pelati', 'POMODORO PELATO 2,5KG')).toBeGreaterThan(30);
    expect(somiglianza('Tofu', 'Seitan')).toBe(0);
    expect(somiglianza('', 'x')).toBe(0);
    expect(somiglianza('a b', 'c d')).toBe(0);
  });
  it('suggerimenti in ordine, solo quelli simili', () => {
    const elenco = [{ nome: 'OLIO SEMI 1 LT' }, { nome: 'CECI SECCHI 5 KG' }, { nome: 'Ceci' }, { nome: 'DETERSIVO' }];
    expect(suggerimenti('Ceci', elenco).map((x) => x.nome)).toEqual(['Ceci', 'CECI SECCHI 5 KG']);
  });
});
