/** Numeri e importi nel formato italiano. */
import type BigNumber from 'bignumber.js';

const EURO = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
const EURO_FINE = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 4, maximumFractionDigits: 4, useGrouping: 'always' });
const PERC = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const num = (v: number | BigNumber) => (typeof v === 'number' ? v : v.toNumber());

/** 12,5 → «12,50 €»; sotto i 10 centesimi mostra 4 decimali (0,0559 €), utili per i costi piccoli. */
export function euro(v: number | BigNumber): string {
  const n = num(v);
  return (n !== 0 && Math.abs(n) < 0.1 ? EURO_FINE : EURO).format(n).replace(/ /g, ' ');
}

export function percentuale(v: number | BigNumber): string {
  return `${PERC.format(num(v))}%`;
}
