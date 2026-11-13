/**
 * Scorte minime del magazzino (passo P1, chiesto da Matteo il 13/11/2026): per ogni voce il titolare
 * imposta una soglia, in confezioni se la voce ne ha una (es. «2 taniche»), altrimenti nell'unità di base.
 * Sotto la soglia: «da ricomprare» (ingredienti, packaging) o «da produrre» (semilavorati).
 * Si salva la soglia nell'unità di base. Vale solo per le voci contate almeno una volta (stock noto).
 */
import { ErroreInventario, numero, type VoceMagazzino } from './inventario';
import type { Stock } from './stock';
import { quantitaLeggibile } from '../produzione/produzione';

/** chiave della voce → scorta minima nell'unità di base. */
export type Scorte = Readonly<Record<string, number>>;

/** Testo scritto (in confezioni se la voce ne ha una) → soglia nell'unità di base; vuoto o 0 = nessuna soglia. */
export function preparaScorta(testo: string, v: Pick<VoceMagazzino, 'conta'>): number | null {
  const n = numero(testo, 'Scorta minima');
  if (n === 0) return null;
  return Math.round(n * (v.conta?.quantita ?? 1) * 1000) / 1000;
}

/** Soglia mostrata nel campo: in confezioni se la voce ne ha una. */
export function testoScorta(minimo: number | undefined, v: Pick<VoceMagazzino, 'conta'>): string {
  if (!minimo) return '';
  const n = minimo / (v.conta?.quantita ?? 1);
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** Nuove scorte dopo aver cambiato (o tolto) la soglia di una voce. */
export function cambiaScorta(scorte: Scorte, chiave: string, minimo: number | null): Record<string, number> {
  const s: Record<string, number> = { ...scorte };
  if (minimo === null) delete s[chiave]; else s[chiave] = minimo;
  return s;
}

/** Quantità in confezioni («1,5 taniche») se la voce ne ha una, altrimenti nell'unità di base. */
export function inConfezioni(q: number, v: Pick<VoceMagazzino, 'conta' | 'unita'>): string {
  if (!v.conta) return quantitaLeggibile(q, v.unita);
  const n = Math.round((q / v.conta.quantita) * 10) / 10;
  return `${n.toLocaleString('it-IT', { maximumFractionDigits: 1 })} ${v.conta.nome}`;
}

export interface SottoScorta {
  chiave: string;
  nome: string;
  azione: 'da ricomprare' | 'da produrre';
  stock: number;
  minimo: number;
  testo: string;
}

/** Voci contate almeno una volta con lo stock di oggi sotto la scorta minima, le più scoperte prima. */
export function sottoScorta(voci: readonly VoceMagazzino[], stock: readonly Stock[], scorte: Scorte): SottoScorta[] {
  const perChiave = new Map(stock.map((s) => [s.chiave, s] as const));
  const out: (SottoScorta & { quota: number })[] = [];
  for (const v of voci) {
    const minimo = scorte[v.chiave];
    const s = perChiave.get(v.chiave);
    if (!minimo || !s || s.teorico === null || s.teorico >= minimo) continue;
    const azione = v.tipo === 'semilavorato' ? 'da produrre' : 'da ricomprare';
    out.push({
      chiave: v.chiave, nome: v.nome, azione, stock: s.teorico, minimo, quota: s.teorico / minimo,
      testo: `${v.nome} ${azione}: ne hai ${inConfezioni(Math.max(0, s.teorico), v)}, minimo ${inConfezioni(minimo, v)}`,
    });
  }
  return out.sort((a, b) => a.quota - b.quota || a.nome.localeCompare(b.nome, 'it')).map(({ quota: _q, ...x }) => x);
}

export { ErroreInventario as ErroreScorta };
