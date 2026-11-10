import { describe, expect, it } from 'vitest';
import type { Riga } from './carrello';
import { nomeMovimento, preparaMovimenti, riepilogoMovimenti } from './movimenti';

const K: Riga = { prodotto: 'k', descrizione: 'Kebab', quantita: 1, centesimi: 1200, aliquota: '10' };
const P: Riga = { prodotto: 'p', descrizione: 'Patate', quantita: 2, centesimi: 500, aliquota: '10' };
const BASE = { tipo: 'pasto_staff' as const, motivo: ' pranzo ', evento: 'ev1', cassa: 'Cassa 1', giorno: '2026-11-10', gruppo: 'g1' };

describe('movimenti senza incasso', () => {
  it('uno per prodotto, quantità sommate, nessun importo', () => {
    const m = preparaMovimenti([K, P, { ...K, quantita: 2 }], { ...BASE, persona: ' Luca ' });
    expect(m).toEqual([
      { tipo: 'pasto_staff', prodotto: 'k', descrizione: 'Kebab', quantita: 3, motivo: 'pranzo', persona: 'Luca', evento: 'ev1', cassa: 'Cassa 1', giorno: '2026-11-10', gruppo: 'g1' },
      { tipo: 'pasto_staff', prodotto: 'p', descrizione: 'Patate', quantita: 2, motivo: 'pranzo', persona: 'Luca', evento: 'ev1', cassa: 'Cassa 1', giorno: '2026-11-10', gruppo: 'g1' },
    ]);
    expect(preparaMovimenti([K], { ...BASE, persona: ' ' })[0]).not.toHaveProperty('persona');
    expect(JSON.stringify(m)).not.toMatch(/centesimi|prezzo|importo/);
  });

  it('rifiuta righe libere, motivo vuoto, carrello vuoto e tipi non ammessi', () => {
    expect(() => preparaMovimenti([{ descrizione: 'Varie', quantita: 1, centesimi: 100, aliquota: '10' }], BASE)).toThrow(/solo prodotti/);
    expect(() => preparaMovimenti([K], { ...BASE, motivo: '  ' })).toThrow(/motivo/);
    expect(() => preparaMovimenti([], BASE)).toThrow(/almeno/);
    expect(() => preparaMovimenti([K], { ...BASE, tipo: 'omaggio' as never })).toThrow(/non ammesso/);
  });

  it('riepilogo per tipo', () => {
    const m = [...preparaMovimenti([K, P], BASE), ...preparaMovimenti([P], { ...BASE, tipo: 'scarto', motivo: 'caduto' }), ...preparaMovimenti([K], BASE)];
    expect(riepilogoMovimenti(m)).toEqual([
      { tipo: 'pasto_staff', nome: 'Pasto staff', pezzi: 4, prodotti: '2× Kebab, 2× Patate' },
      { tipo: 'scarto', nome: 'Scarto', pezzi: 2, prodotti: '2× Patate' },
    ]);
    expect(nomeMovimento('prova')).toBe('Prova / assaggio');
    expect(nomeMovimento('x' as never)).toBe('x');
  });
});
