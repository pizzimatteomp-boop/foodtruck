import BigNumber from 'bignumber.js';
import { euro, percentuale } from './formato';

describe('formato italiano', () => {
  it('euro con 2 decimali, 4 per i costi sotto i 10 centesimi', () => {
    expect(euro(12.5)).toBe('12,50 €');
    expect(euro(1234.5)).toBe('1.234,50 €');
    expect(euro(new BigNumber('0.0559123'))).toBe('0,0559 €');
    expect(euro(0)).toBe('0,00 €');
  });
  it('percentuali con un decimale', () => {
    expect(percentuale(5.115)).toBe('5,1%');
    expect(percentuale(new BigNumber(30))).toBe('30,0%');
  });
});
