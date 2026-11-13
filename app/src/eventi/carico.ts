/**
 * Previsione dell'evento (P2) e piano di carico (P3), chiesti da Matteo il 13/11/2026.
 * Fatturato previsto × % del prodotto (sul fatturato) / prezzo = pezzi, più la scorta di sicurezza
 * (di base +15%); alcuni prodotti (es. tempeh) hanno invece pezzi fissi per evento, senza scorta.
 * I pezzi si scompongono con le ricette: ingredienti e packaging come tali, semilavorati come semilavorati
 * (si caricano pronti); poi si arrotonda alle confezioni di conta e si confronta con lo stock.
 * Modulo puro e testato.
 */
import type { ScontrinoArchivio } from '../cassa/archivio';
import type { Prodotto } from '../foodcost/modello';
import type { Sezione, VoceMagazzino } from '../magazzino/inventario';
import { scomponi } from '../magazzino/stock';
import { quantitaLeggibile } from '../produzione/produzione';

export type Modo = '%' | 'pz';
export interface VocePrevisione { modo: Modo; valore: number }
/** id del prodotto vendibile → % del fatturato o pezzi fissi. */
export type Previsione = Readonly<Record<string, VocePrevisione>>;

export const SCORTA_BASE = 15;

export class ErrorePrevisione extends Error {
  override name = 'ErrorePrevisione';
}

const vendibili = (prodotti: readonly Prodotto[]) => prodotti.filter((p) => p.tipo === 'vendibile');

/**
 * Valori di base: quelli salvati dal titolare; per i prodotti mai impostati la quota delle vendite
 * del prodotto (da VegMan Planner) come % del fatturato.
 */
export function previsioneDiBase(prodotti: readonly Prodotto[], salvata?: Previsione | null): Record<string, VocePrevisione> {
  const out: Record<string, VocePrevisione> = {};
  for (const p of vendibili(prodotti)) out[p.id] = salvata?.[p.id] ?? { modo: '%', valore: p.quotaVendite > 0 ? p.quotaVendite : 0 };
  return out;
}

/** Somma delle % (dovrebbe fare 100 per i prodotti a percentuale). */
export function sommaPercentuali(prev: Previsione): number {
  return Math.round(Object.values(prev).reduce((t, v) => t + (v.modo === '%' ? v.valore : 0), 0) * 10) / 10;
}

/** «23,5» → 23.5; vuoto → 0. */
export function numeroPrevisione(testo: string, campo: string, massimo = 1_000_000): number {
  const t = testo.trim().replace(',', '.');
  if (!t) return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > massimo) throw new ErrorePrevisione(`${campo}: scrivi un numero tra 0 e ${massimo.toLocaleString('it-IT')}.`);
  return n;
}

export interface PezziPrevisti { id: string; nome: string; modo: Modo; pezzi: number; incasso: number }

/**
 * Pezzi da preparare per prodotto: a % → fatturato × % / prezzo × (1 + scorta), arrotondato in su;
 * pezzi fissi → così come sono (niente scorta). Prodotti a 0 o senza prezzo esclusi.
 */
export function pezziPrevisti(prodotti: readonly Prodotto[], prev: Previsione, fatturato: number, scorta: number): PezziPrevisti[] {
  const out: PezziPrevisti[] = [];
  for (const p of vendibili(prodotti)) {
    const v = prev[p.id];
    if (!v || !(v.valore > 0)) continue;
    if (v.modo === 'pz') { out.push({ id: p.id, nome: p.nome, modo: 'pz', pezzi: Math.ceil(v.valore), incasso: Math.ceil(v.valore) * p.prezzo }); continue; }
    if (!(p.prezzo > 0) || !(fatturato > 0)) continue;
    const base = (fatturato * v.valore) / 100 / p.prezzo;
    out.push({ id: p.id, nome: p.nome, modo: '%', pezzi: Math.ceil(base * (1 + scorta / 100) - 1e-9), incasso: (fatturato * v.valore) / 100 });
  }
  return out.sort((a, b) => b.pezzi - a.pezzi || a.nome.localeCompare(b.nome, 'it'));
}

export interface RigaCarico {
  chiave: string;
  nome: string;
  sezione: Sezione;
  /** Quantità necessaria nell'unità di base (prima dell'arrotondamento alle confezioni). */
  quantita: number;
  unita: string;
  /** Confezione di conta (es. sacco da 5000 g), se la voce ne ha una. */
  confezione: { nome: string; quantita: number } | null;
  /** Confezioni da caricare (arrotondate in su), se c'è la confezione. */
  confezioni: number | null;
  /** Stock teorico di oggi (null = mai contato). */
  stock: number | null;
  /** Quanto manca rispetto allo stock (0 = basta; null = stock non noto). */
  manca: number | null;
}

const ORDINE: Sezione[] = ['alimentare', 'semilavorato', 'packaging'];
const arrot = (n: number) => Math.round(n * 1000) / 1000;

/** Dai pezzi dei prodotti alle voci da caricare, con confezioni e confronto con lo stock. */
export function pianoDiCarico(pezzi: readonly Pick<PezziPrevisti, 'id' | 'pezzi'>[], prodotti: readonly Prodotto[], voci: readonly VoceMagazzino[], stock: ReadonlyMap<string, number | null>): RigaCarico[] {
  const perId = new Map(prodotti.map((p) => [p.id, p] as const));
  const totale = new Map<string, number>();
  for (const x of pezzi) for (const [k, q] of scomponi(x.id, x.pezzi, perId)) totale.set(k, (totale.get(k) ?? 0) + q);
  const perChiave = new Map(voci.map((v) => [v.chiave, v] as const));
  const out: RigaCarico[] = [];
  for (const [k, q0] of totale) {
    const v = perChiave.get(k);
    if (!v || !(q0 > 0)) continue;
    const quantita = v.unita.trim().toLowerCase() === 'pz' ? Math.ceil(q0 - 1e-9) : arrot(q0);
    const confezioni = v.conta ? Math.ceil(quantita / v.conta.quantita - 1e-9) : null;
    const s = stock.has(k) ? stock.get(k)! : null;
    out.push({
      chiave: k, nome: v.nome, sezione: v.sezione, quantita, unita: v.unita, confezione: v.conta ? { nome: v.conta.nome, quantita: v.conta.quantita } : null,
      confezioni, stock: s, manca: s === null ? null : arrot(Math.max(0, quantita - s)),
    });
  }
  return out.sort((a, b) => ORDINE.indexOf(a.sezione) - ORDINE.indexOf(b.sezione) || a.nome.localeCompare(b.nome, 'it'));
}

/** «3 sacchi (13,8 kg)» oppure «1,2 kg» / «87 pz». */
export function daCaricare(r: Pick<RigaCarico, 'quantita' | 'unita' | 'confezione' | 'confezioni'>): string {
  const q = quantitaLeggibile(r.quantita, r.unita);
  return r.confezione && r.confezioni !== null ? `${r.confezioni} ${r.confezione.nome} (${q})` : q;
}

/** Cosa manca, in confezioni se ci sono: «mancano 2 sacchi» / «mancano 300 g». */
export function testoManca(r: Pick<RigaCarico, 'manca' | 'unita' | 'confezione' | 'sezione'>): string {
  if (r.manca === null) return 'stock non contato';
  if (r.manca <= 0) return '';
  const q = r.confezione ? `${Math.ceil(r.manca / r.confezione.quantita - 1e-9)} ${r.confezione.nome}` : quantitaLeggibile(r.manca, r.unita);
  return `${r.sezione === 'semilavorato' ? 'da produrre' : 'da comprare'}: ${q}`;
}

export const NOMI_SEZIONE_CARICO: Record<Sezione, string> = { alimentare: 'Cibo', semilavorato: 'Semilavorati (pronti)', packaging: 'Packaging' };

/**
 * % reali del fatturato per prodotto, dalle vendite della cassa (scontrini non annullati, solo righe
 * di prodotto). Restituisce null se non ci sono vendite.
 */
export function percentualiReali(scontrini: readonly Pick<ScontrinoArchivio, 'tipo' | 'idtrx' | 'idtrxOriginale' | 'righe'>[]): Record<string, number> | null {
  const annullati = new Set(scontrini.filter((s) => s.tipo === 'A' && s.idtrxOriginale).map((s) => s.idtrxOriginale!));
  const incasso = new Map<string, number>();
  for (const s of scontrini) {
    if (s.tipo !== 'V' || annullati.has(s.idtrx)) continue;
    for (const r of s.righe) if (r.prodotto) incasso.set(r.prodotto, (incasso.get(r.prodotto) ?? 0) + r.quantita * r.prezzo);
  }
  const tot = [...incasso.values()].reduce((t, x) => t + x, 0);
  if (!(tot > 0)) return null;
  const out: Record<string, number> = {};
  for (const [id, x] of incasso) out[id] = Math.round((x / tot) * 1000) / 10;
  return out;
}

export interface DaProdurre { id: string; nome: string; unita: string; evento: string; dal: string; serve: number; fatto: number; resta: number }

/**
 * Lista di produzione (P4): semilavorati che mancavano nei piani di carico degli eventi non ancora finiti,
 * meno quanto il laboratorio ha prodotto dopo la preparazione del piano (assegnato prima agli eventi più vicini).
 * Solo quelli che restano da fare.
 */
export function daProdurre(
  carichi: readonly { evento: string; dal: string; al: string; preparatoMs: number; righe: readonly Pick<RigaCarico, 'chiave' | 'nome' | 'unita' | 'sezione' | 'manca'>[] }[],
  produzioni: readonly { prodotto: string; quantita: number; ms: number }[],
  oggi: string,
): DaProdurre[] {
  const prossimi = carichi.filter((c) => c.al >= oggi).sort((a, b) => a.dal.localeCompare(b.dal) || a.evento.localeCompare(b.evento, 'it'));
  const usato = new Map<string, number>();
  const out: DaProdurre[] = [];
  for (const c of prossimi) {
    for (const r of c.righe) {
      if (r.sezione !== 'semilavorato' || !r.manca || r.manca <= 0) continue;
      const id = r.chiave.replace(/^semilavorato-/, '');
      const prodotto = produzioni.filter((p) => p.prodotto === id && p.ms > c.preparatoMs).reduce((t, p) => t + p.quantita, 0);
      const disponibile = Math.max(0, prodotto - (usato.get(id) ?? 0));
      const fatto = Math.min(r.manca, disponibile);
      usato.set(id, (usato.get(id) ?? 0) + fatto);
      const resta = arrot(r.manca - fatto);
      if (resta > 0) out.push({ id, nome: r.nome, unita: r.unita, evento: c.evento, dal: c.dal, serve: r.manca, fatto: arrot(fatto), resta });
    }
  }
  return out;
}
