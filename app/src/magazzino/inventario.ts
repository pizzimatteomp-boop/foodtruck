/**
 * Inventario del magazzino (passo M2 + M4, prima parte): si contano ingredienti, packaging e semilavorati
 * (non i prodotti finiti, deciso da Matteo il 12/11/2026), a confezioni + sfuso, nell'unità di ogni voce.
 * La «confezione» di ogni voce (es. «sacco · 5000 g») la sceglie chi conta; se manca si propone quella
 * dell'ingrediente. Modulo puro e testato; il confronto con lo stock teorico arriva al passo M3.
 */
import type { Ingrediente, Prodotto } from '../foodcost/modello';

export type TipoVoce = 'ingrediente' | 'semilavorato';
export type Sezione = 'alimentare' | 'packaging' | 'semilavorato';

export interface UnitaConta { nome: string; quantita: number }

export interface VoceMagazzino {
  chiave: string;
  tipo: TipoVoce;
  id: string;
  nome: string;
  sezione: Sezione;
  /** Unità di base (g, ml, pz…). */
  unita: string;
  conta: UnitaConta | null;
}

export interface Conta { confezioni: number; sfuso: number }

export class ErroreInventario extends Error {
  override name = 'ErroreInventario';
}

export const chiave = (tipo: TipoVoce, id: string) => `${tipo}-${id}`;

export const NOMI_SEZIONE: Record<Sezione, string> = { alimentare: 'Ingredienti', packaging: 'Packaging', semilavorato: 'Semilavorati' };

/** Le voci da contare, in ordine di sezione e nome. */
export function vociMagazzino(ingredienti: readonly Ingrediente[], prodotti: readonly Prodotto[], unita: ReadonlyMap<string, UnitaConta>): VoceMagazzino[] {
  const voci: VoceMagazzino[] = [
    ...ingredienti.map((i) => {
      const k = chiave('ingrediente', i.id);
      return {
        chiave: k, tipo: 'ingrediente' as const, id: i.id, nome: i.nome, sezione: i.categoria, unita: i.unita,
        conta: unita.get(k) ?? (i.confezione ? { nome: 'confezione', quantita: i.confezione } : null),
      };
    }),
    ...prodotti.filter((p) => p.tipo === 'semilavorato').map((p) => {
      const k = chiave('semilavorato', p.id);
      return { chiave: k, tipo: 'semilavorato' as const, id: p.id, nome: p.nome, sezione: 'semilavorato' as const, unita: p.resa.unita || 'pz', conta: unita.get(k) ?? null };
    }),
  ];
  const ordine: Sezione[] = ['alimentare', 'packaging', 'semilavorato'];
  return voci.sort((a, b) => ordine.indexOf(a.sezione) - ordine.indexOf(b.sezione) || a.nome.localeCompare(b.nome, 'it'));
}

/** «5000» o «5,5» → numero ≥ 0 (vuoto = 0). */
export function numero(testo: string, campo: string): number {
  const t = testo.trim().replace(',', '.');
  if (!t) return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new ErroreInventario(`${campo}: scrivi un numero.`);
  return n;
}

export function preparaUnita(nome: string, quantita: string): UnitaConta {
  const n = nome.trim().slice(0, 30);
  if (!n) throw new ErroreInventario('Scrivi il nome della confezione (es. sacco, bottiglia, busta).');
  const q = numero(quantita, 'Quantità della confezione');
  if (!(q > 0)) throw new ErroreInventario('La confezione deve contenere più di zero.');
  return { nome: n, quantita: q };
}

/** Totale nell'unità di base. */
export function totale(c: Conta, conta: UnitaConta | null): number {
  return Math.round(((conta ? c.confezioni * conta.quantita : 0) + c.sfuso) * 1000) / 1000;
}

export interface RigaInventario { tipo: TipoVoce; id: string; nome: string; unita: string; quantita: number; confezioni: number; sfuso: number; confezione?: UnitaConta }
export interface Inventario { giorno: string; righe: RigaInventario[]; nota?: string }

/** Inventario da salvare: solo le voci contate (le altre restano come prima). */
export function preparaInventario(voci: readonly VoceMagazzino[], conte: Readonly<Record<string, Conta>>, giorno: string, nota?: string): Inventario {
  const righe = voci.filter((v) => conte[v.chiave]).map((v) => {
    const c = conte[v.chiave]!;
    return {
      tipo: v.tipo, id: v.id, nome: v.nome, unita: v.unita, quantita: totale(c, v.conta), confezioni: v.conta ? c.confezioni : 0, sfuso: c.sfuso,
      ...(v.conta && c.confezioni ? { confezione: v.conta } : {}),
    };
  });
  if (!righe.length) throw new ErroreInventario('Non hai contato niente.');
  const n = nota?.trim().slice(0, 300);
  return { giorno, righe, ...(n ? { nota: n } : {}) };
}

/** Bozza salvata nel telefono mentre si conta (resta anche chiudendo l'app). */
export interface Bozza { giorno: string; conte: Record<string, Conta> }
export function leggiBozza(testo: string | null, giorno: string): Bozza {
  try {
    const b = JSON.parse(testo ?? 'null') as Bozza | null;
    if (b && typeof b === 'object' && b.conte && typeof b.giorno === 'string') return b;
  } catch { /* bozza illeggibile: si riparte */ }
  return { giorno, conte: {} };
}

/**
 * Voci da contare scelte dal titolare (per non spaventare il magazziniere con l'elenco intero).
 * Senza scelta (null) si conta tutto; le voci nuove compaiono solo quando il titolare le spunta.
 */
export function daContare(voci: readonly VoceMagazzino[], scelta: readonly string[] | null): VoceMagazzino[] {
  if (!scelta) return [...voci];
  const si = new Set(scelta);
  return voci.filter((v) => si.has(v.chiave));
}

/** Spunta o toglie delle voci; dalla scelta «tutto» (null) si parte con tutte le voci esistenti. Solo chiavi esistenti, ordinate. */
export function cambiaScelta(voci: readonly VoceMagazzino[], scelta: readonly string[] | null, chiavi: readonly string[], si: boolean): string[] {
  const s = new Set(scelta ?? voci.map((v) => v.chiave));
  for (const k of chiavi) { if (si) s.add(k); else s.delete(k); }
  return voci.map((v) => v.chiave).filter((k) => s.has(k));
}
