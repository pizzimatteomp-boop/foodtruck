/**
 * Movimenti senza incasso (fase «Cassa», C4): pasto staff, prova/assaggio, scarto.
 * Nessun importo e nessuno scontrino: se qualcuno paga è una vendita. L'omaggio invece è uno
 * scontrino a 0 € e il «pagato dall'organizzatore» uno scontrino non riscosso (archivio.ts).
 * Si registrano per prodotto (servono al magazzino) e non si modificano né si cancellano.
 */
import type { Riga } from './carrello';
import { ErroreCassa } from './carrello';

export type TipoMovimento = 'pasto_staff' | 'prova' | 'scarto';

export const TIPI_MOVIMENTO: { tipo: TipoMovimento; nome: string; aiuto: string }[] = [
  { tipo: 'pasto_staff', nome: 'Pasto staff', aiuto: 'chi ha mangiato' },
  { tipo: 'prova', nome: 'Prova / assaggio', aiuto: 'cosa si è provato' },
  { tipo: 'scarto', nome: 'Scarto', aiuto: 'rovinato, caduto, scaduto…' },
];

export const nomeMovimento = (t: TipoMovimento) => TIPI_MOVIMENTO.find((x) => x.tipo === t)?.nome ?? t;

export interface Movimento {
  tipo: TipoMovimento;
  /** Prodotto della pagina Prodotti. */
  prodotto: string;
  descrizione: string;
  quantita: number;
  motivo: string;
  /** Chi ha consumato (facoltativo; chi registra è sempre annotato a parte). */
  persona?: string;
  evento: string;
  cassa: string;
  /** aaaa-mm-gg sul fuso di Roma. */
  giorno: string;
  /** Lega le righe registrate insieme. */
  gruppo: string;
}

/** Un movimento per prodotto. Solo prodotti (niente righe a importo libero), motivo obbligatorio. */
export function preparaMovimenti(righe: readonly Riga[], a: {
  tipo: TipoMovimento; motivo: string; persona?: string; evento: string; cassa: string; giorno: string; gruppo: string;
}): Movimento[] {
  if (!TIPI_MOVIMENTO.some((x) => x.tipo === a.tipo)) throw new ErroreCassa('Tipo di movimento non ammesso.');
  if (!righe.length) throw new ErroreCassa('Scegli almeno un prodotto.');
  if (righe.some((r) => !r.prodotto)) throw new ErroreCassa('Nei movimenti senza incasso vanno solo prodotti, non importi.');
  const motivo = a.motivo.trim().slice(0, 200);
  if (!motivo) throw new ErroreCassa('Scrivi il motivo.');
  const persona = a.persona?.trim().slice(0, 60);
  // Stesso prodotto su più righe: una sola registrazione con la somma.
  const perProdotto = new Map<string, Riga & { prodotto: string }>();
  for (const r of righe) {
    const g = perProdotto.get(r.prodotto!);
    perProdotto.set(r.prodotto!, g ? { ...g, quantita: g.quantita + r.quantita } : { ...r, prodotto: r.prodotto! });
  }
  return [...perProdotto.values()].map((r) => ({
    tipo: a.tipo, prodotto: r.prodotto, descrizione: r.descrizione, quantita: r.quantita, motivo,
    ...(persona ? { persona } : {}), evento: a.evento, cassa: a.cassa, giorno: a.giorno, gruppo: a.gruppo,
  }));
}

/** Riepilogo per tipo: pezzi per prodotto. */
export function riepilogoMovimenti(m: readonly Movimento[]): { tipo: TipoMovimento; nome: string; pezzi: number; prodotti: string }[] {
  return TIPI_MOVIMENTO.map(({ tipo, nome }) => {
    const suoi = m.filter((x) => x.tipo === tipo);
    const per = new Map<string, number>();
    for (const x of suoi) per.set(x.descrizione, (per.get(x.descrizione) ?? 0) + x.quantita);
    return {
      tipo, nome, pezzi: suoi.reduce((t, x) => t + x.quantita, 0),
      prodotti: [...per].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it')).map(([d, q]) => `${q}× ${d}`).join(', '),
    };
  }).filter((x) => x.pezzi > 0);
}
