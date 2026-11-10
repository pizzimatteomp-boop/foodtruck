import { describe, expect, it } from 'vitest';
import {
  aggiungiLibera, aggiungiProdotto, centesimiDa, coloreGruppo, ErroreCassa, per, pezzi, preferiti, premi, righePerScontrino,
  TASTIERINO_VUOTO, togliUno, totaleCentesimi, type Tastierino,
} from './carrello';

const KEBAB = { id: 'k', nome: 'Kebab', prezzo: 12, iva: '10' as const };
const ACQUA = { id: 'a', nome: 'Acqua', prezzo: 1.5, iva: '22' as const };
const digita = (s: string, t: Tastierino = TASTIERINO_VUOTO) => [...s].reduce(premi, t);

describe('tastierino', () => {
  it('cifre, punto, centesimi al massimo due, cancella e azzera', () => {
    expect(digita('4.505').testo).toBe('4.50');
    expect(digita('.5').testo).toBe('0.5');
    expect(digita('1..2').testo).toBe('1.2');
    expect(digita('007').testo).toBe('7');
    expect(digita('12345678').testo).toBe('1234567');
    expect(premi(digita('12'), '⌫').testo).toBe('1');
    expect(premi(digita('12'), 'C')).toEqual(TASTIERINO_VUOTO);
    expect(premi(digita('1'), 'x').testo).toBe('1');
  });

  it('importo in centesimi', () => {
    expect(centesimiDa('4.5')).toBe(450);
    expect(centesimiDa('4.05')).toBe(405);
    expect(centesimiDa('12')).toBe(1200);
    expect(centesimiDa('.5')).toBe(50);
    expect(centesimiDa('')).toBeNull();
    expect(centesimiDa('.')).toBeNull();
    expect(centesimiDa('1.234')).toBeNull();
  });

  it('«×» fissa la quantità della prossima riga', () => {
    expect(per(digita('3'))).toEqual({ testo: '', quantita: 3 });
    expect(() => per(digita('1.5'))).toThrow(ErroreCassa);
    expect(() => per(TASTIERINO_VUOTO)).toThrow(/numero intero/);
    expect(() => per(digita('1000'))).toThrow();
  });
});

describe('righe dello scontrino', () => {
  it('prodotti: stesso prodotto si somma, quantità col «×», totale e pezzi in centesimi esatti', () => {
    let r = aggiungiProdotto([], KEBAB);
    r = aggiungiProdotto(r, ACQUA, 3);
    r = aggiungiProdotto(r, KEBAB);
    expect(r).toEqual([
      { prodotto: 'k', descrizione: 'Kebab', quantita: 2, centesimi: 1200, aliquota: '10' },
      { prodotto: 'a', descrizione: 'Acqua', quantita: 3, centesimi: 150, aliquota: '22' },
    ]);
    expect(totaleCentesimi(r)).toBe(2850);
    expect(pezzi(r)).toBe(5);
    expect(righePerScontrino(r)[1]).toEqual({ descrizione: 'Acqua', quantita: 3, prezzo: 1.5, aliquota: '22' });
    expect(aggiungiProdotto([], { id: 'x', nome: 'Senza IVA', prezzo: 0.1 })[0]!.aliquota).toBe('10');
    expect(() => aggiungiProdotto([], { id: 'z', nome: 'Zero', prezzo: 0 })).toThrow(/prezzo/);
  });

  it('importo libero: descrizione, IVA e quantità; errori chiari', () => {
    const r = aggiungiLibera([], { testo: '4.5', quantita: 2 }, '  Panino speciale ', '10');
    expect(r).toEqual([{ descrizione: 'Panino speciale', quantita: 2, centesimi: 450, aliquota: '10' }]);
    expect(aggiungiLibera([], digita('1'), '', '22')[0]!.descrizione).toBe('Varie');
    expect(() => aggiungiLibera([], TASTIERINO_VUOTO, 'x', '10')).toThrow(/importo/);
    expect(() => aggiungiLibera([], digita('0'), 'x', '10')).toThrow(/importo/);
    expect(() => aggiungiLibera([], digita('1'), 'x'.repeat(61), '10')).toThrow(/lunga/);
  });

  it('togli uno: scala la quantità, poi toglie la riga', () => {
    const r = aggiungiProdotto([], KEBAB, 2);
    expect(togliUno(r, 0)[0]!.quantita).toBe(1);
    expect(togliUno(togliUno(r, 0), 0)).toEqual([]);
  });
});

describe('griglia', () => {
  it('preferiti per quota di vendita; colori stabili per gruppo', () => {
    const p = [{ nome: 'B', quotaVendite: 10 }, { nome: 'A', quotaVendite: 10 }, { nome: 'C', quotaVendite: 50 }, { nome: 'D', quotaVendite: 1 }, { nome: 'E', quotaVendite: 0 }];
    expect(preferiti(p).map((x) => x.nome)).toEqual(['C', 'A', 'B', 'D']);
    expect(coloreGruppo('Bevande', ['Vegman', 'Bevande'])).toBe('var(--menta)');
    expect(coloreGruppo('Vegman', ['Vegman', 'Bevande', 'Vegman'])).toBe('var(--arancio)');
    expect(coloreGruppo('Sconosciuto', ['A'])).toBe('var(--menta)');
    expect(coloreGruppo('F', ['A', 'B', 'C', 'D', 'E', 'F'])).toBe('var(--menta)');
  });
});
