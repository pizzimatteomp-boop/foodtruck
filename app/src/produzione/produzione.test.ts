import { describe, expect, it } from 'vitest';
import type { ListaIngredienti } from '../etichette/lista';
import { contenutoEtichetta, corpoIngredienti, giornoRoma, leggiMisura, lotto, MISURA_PREDEFINITA, preparaProduzione, quantitaLeggibile } from './produzione';

const QUANDO = new Date('2026-11-12T14:30:00Z'); // 15:30 a Roma
const MAYO = { id: 'm', nome: 'Mayo vegana', resa: { quantita: 5600, unita: 'g' } };
const LISTA: ListaIngredienti = {
  voci: [
    { tipo: 'ingrediente', id: 'o', nome: { it: 'olio di semi', en: 'seed oil' }, peso: 4000, composizione: null, componenti: [], evidenzia: false },
    { tipo: 'ingrediente', id: 's', nome: { it: 'latte di soia', en: 'soy milk' }, peso: 1500, composizione: { it: 'acqua, *soia*', en: 'water, *soy*' }, componenti: [], evidenzia: false },
    { tipo: 'ingrediente', id: 'n', nome: { it: 'senape', en: 'mustard' }, peso: 100, composizione: null, componenti: [], evidenzia: true },
  ],
  allergeni: ['soia', 'senape'], tracce: ['glutine'], problemi: { it: [], en: [] },
};

describe('produzione ed etichette', () => {
  it('lotto, giorno e quantità leggibili (fuso di Roma)', () => {
    expect(lotto('Mayo vegana', QUANDO)).toBe('MAY-121126-1530');
    expect(lotto('è', QUANDO)).toBe('EXX-121126-1530');
    expect(giornoRoma(new Date('2026-11-12T23:30:00Z'))).toBe('2026-11-13');
    expect(quantitaLeggibile(5600, 'g')).toBe('5,6 kg');
    expect(quantitaLeggibile(800, 'g')).toBe('800 g');
    expect(quantitaLeggibile(2500, 'ml')).toBe('2,5 L');
    expect(quantitaLeggibile(3, 'pz')).toBe('3 pz');
  });

  it('registrazione: quantità e copie controllate, nota facoltativa', () => {
    expect(preparaProduzione(MAYO, { quantita: '5600', copie: '4', nota: ' busta 1 di 4 ' }, QUANDO)).toEqual({
      prodotto: 'm', nome: 'Mayo vegana', quantita: 5600, unita: 'g', copie: 4, lotto: 'MAY-121126-1530', giorno: '2026-11-12', nota: 'busta 1 di 4',
    });
    expect(preparaProduzione(MAYO, { quantita: '2,5', copie: '' }, QUANDO)).toMatchObject({ quantita: 2.5, copie: 0 });
    expect(preparaProduzione({ ...MAYO, resa: { quantita: 1, unita: '' } }, { quantita: '1', copie: '1' }, QUANDO).unita).toBe('pz');
    expect(() => preparaProduzione(MAYO, { quantita: '0', copie: '1' }, QUANDO)).toThrow(/quanto hai prodotto/);
    expect(() => preparaProduzione(MAYO, { quantita: 'abc', copie: '1' }, QUANDO)).toThrow();
    expect(() => preparaProduzione(MAYO, { quantita: '1', copie: '51' }, QUANDO)).toThrow(/da 0 a 50/);
    expect(() => preparaProduzione(MAYO, { quantita: '1', copie: '1.5' }, QUANDO)).toThrow();
  });

  it('contenuto dell\'etichetta: allergeni in grassetto e riepilogo', () => {
    const p = preparaProduzione(MAYO, { quantita: '5600', copie: '1', nota: 'sottovuoto' }, QUANDO);
    const c = contenutoEtichetta(p, LISTA, QUANDO);
    expect(c).toMatchObject({ prodotto: 'Mayo vegana', data: '12/11/2026', lotto: 'MAY-121126-1530', quantita: '5,6 kg', nota: 'sottovuoto' });
    expect(c.ingredienti).toEqual([
      { testo: 'olio di semi, latte di soia (acqua, ', grassetto: false }, { testo: 'soia', grassetto: true },
      { testo: '), ', grassetto: false }, { testo: 'senape', grassetto: true },
    ]);
    expect(c.contiene).toMatch(/soia/i);
    expect(c.puoContenere).toMatch(/glutine/i);
    expect(contenutoEtichetta({ ...p, nota: undefined } as never, LISTA, QUANDO)).not.toHaveProperty('nota');
  });

  it('misura dell\'etichetta e grandezza del testo', () => {
    expect(leggiMisura('100x50')).toEqual({ larghezza: 100, altezza: 50 });
    expect(leggiMisura(' 60 × 40 ')).toEqual({ larghezza: 60, altezza: 40 });
    expect(leggiMisura('500x50')).toEqual(MISURA_PREDEFINITA);
    expect(leggiMisura(null)).toEqual(MISURA_PREDEFINITA);
    const corto = { ingredienti: [{ testo: 'ceci, acqua', grassetto: false }], contiene: '', puoContenere: '' };
    const medio = { ...corto, ingredienti: [{ testo: 'x'.repeat(900), grassetto: false }] };
    const lungo = { ...corto, ingredienti: [{ testo: 'x'.repeat(3000), grassetto: false }] };
    expect(corpoIngredienti(medio, MISURA_PREDEFINITA)).toBe(2.3);
    expect(corpoIngredienti(corto, MISURA_PREDEFINITA)).toBe(3);
    expect(corpoIngredienti(lungo, MISURA_PREDEFINITA)).toBe(1.6);
  });
});
