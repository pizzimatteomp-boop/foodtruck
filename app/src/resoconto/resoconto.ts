/**
 * Resoconto di un evento (per il titolare): incassi, vendite per prodotto, senza incasso, margine stimato.
 * Tutto dai dati che la cassa già raccoglie (scontrini e movimenti) e dal food cost dei prodotti.
 * Importi in centesimi interi; il costo delle materie è una stima (prezzi di oggi degli ingredienti).
 */
import type { ScontrinoArchivio } from '../cassa/archivio';
import type { Movimento } from '../cassa/movimenti';
import { nomeMovimento, type TipoMovimento } from '../cassa/movimenti';

/** Costo per pezzo di un prodotto (euro) e se il calcolo è completo. */
export type Costi = ReadonlyMap<string, { costo: number; completo: boolean; nome: string }>;

export interface RigaProdotto {
  chiave: string;
  nome: string;
  pezzi: number;
  /** Centesimi IVA inclusa. */
  incasso: number;
  /** Centesimi al netto dell'IVA. */
  netto: number;
  /** Centesimi; null = importo libero o prodotto senza costo. */
  costo: number | null;
  completo: boolean;
}

export interface Resoconto {
  /** Scontrini di prova (simulatore) e non dell'Agenzia vera. */
  prova: boolean;
  scontrini: number;
  annullati: number;
  contanti: number;
  carta: number;
  incasso: number;
  netto: number;
  medio: number;
  perGiorno: { giorno: string; incasso: number; scontrini: number }[];
  perCassa: { cassa: string; incasso: number; scontrini: number }[];
  prodotti: RigaProdotto[];
  senzaIncasso: { tipo: TipoMovimento; nome: string; pezzi: number; costo: number; dettaglio: string }[];
  /** Costo materie dei prodotti venduti e dei movimenti senza incasso (centesimi). */
  costoVenduto: number;
  costoSenzaIncasso: number;
  /** Netto − costi (centesimi): margine lordo stimato sulle materie prime. */
  margine: number;
  /** % costo materie del venduto sul netto (null senza vendite). */
  foodCost: number | null;
  /** Prodotti col costo incompleto (manca il prezzo di qualche ingrediente). */
  incompleti: string[];
}

const netto = (lordoCent: number, aliquota: string) => {
  const a = Number(aliquota);
  return Number.isFinite(a) ? Math.round(lordoCent / (1 + a / 100)) : lordoCent;
};

export function resoconto(scontriniTutti: readonly ScontrinoArchivio[], movimenti: readonly Movimento[], costi: Costi): Resoconto {
  // Con scontrini veri si guardano solo quelli; altrimenti quelli di prova.
  const veri = scontriniTutti.some((s) => s.ambiente === 'agenzia');
  const scontrini = scontriniTutti.filter((s) => s.ambiente === (veri ? 'agenzia' : 'simulatore'));
  const annullati = new Set(scontrini.filter((s) => s.tipo === 'A' && s.idtrxOriginale).map((s) => s.idtrxOriginale!));
  const vendite = scontrini.filter((s) => s.tipo === 'V' && !annullati.has(s.idtrx));

  let contanti = 0, carta = 0, nettoTot = 0;
  const giorni = new Map<string, { incasso: number; scontrini: number }>();
  const casse = new Map<string, { incasso: number; scontrini: number }>();
  const prodotti = new Map<string, RigaProdotto>();
  for (const s of vendite) {
    const tot = Math.round(s.totale * 100);
    if (s.pagamento === 'contanti') contanti += tot; else if (s.pagamento === 'elettronico') carta += tot;
    const g = giorni.get(s.giorno) ?? { incasso: 0, scontrini: 0 };
    giorni.set(s.giorno, { incasso: g.incasso + tot, scontrini: g.scontrini + 1 });
    const c = casse.get(s.cassa) ?? { incasso: 0, scontrini: 0 };
    casse.set(s.cassa, { incasso: c.incasso + tot, scontrini: c.scontrini + 1 });
    for (const r of s.righe) {
      const lordo = Math.round(r.quantita * r.prezzo * 100);
      const n = netto(lordo, r.aliquota);
      nettoTot += n;
      const chiave = r.prodotto ?? '';
      const costo = r.prodotto ? costi.get(r.prodotto) : undefined;
      const x = prodotti.get(chiave) ?? {
        chiave, nome: r.prodotto ? (costo?.nome ?? r.descrizione) : 'Importi liberi', pezzi: 0, incasso: 0, netto: 0,
        costo: costo ? 0 : null, completo: costo?.completo ?? false,
      };
      x.pezzi += r.quantita;
      x.incasso += lordo;
      x.netto += n;
      if (x.costo !== null && costo) x.costo += Math.round(r.quantita * costo.costo * 100);
      prodotti.set(chiave, x);
    }
  }

  const perTipo = new Map<TipoMovimento, { pezzi: number; costo: number; per: Map<string, number> }>();
  for (const m of movimenti) {
    const t = perTipo.get(m.tipo) ?? { pezzi: 0, costo: 0, per: new Map<string, number>() };
    t.pezzi += m.quantita;
    t.costo += Math.round(m.quantita * (costi.get(m.prodotto)?.costo ?? 0) * 100);
    t.per.set(m.descrizione, (t.per.get(m.descrizione) ?? 0) + m.quantita);
    perTipo.set(m.tipo, t);
  }
  const senzaIncasso = [...perTipo].map(([tipo, t]) => ({
    tipo, nome: nomeMovimento(tipo), pezzi: t.pezzi, costo: t.costo,
    dettaglio: [...t.per].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it')).map(([d, q]) => `${q}× ${d}`).join(', '),
  })).sort((a, b) => b.pezzi - a.pezzi);

  const righe = [...prodotti.values()].sort((a, b) => b.incasso - a.incasso);
  const costoVenduto = righe.reduce((t, r) => t + (r.costo ?? 0), 0);
  const costoSenzaIncasso = senzaIncasso.reduce((t, r) => t + r.costo, 0);
  const incasso = contanti + carta;
  const incompleti = [...new Set([
    ...righe.filter((r) => r.costo !== null && !r.completo).map((r) => r.nome),
    ...movimenti.filter((m) => costi.get(m.prodotto) && !costi.get(m.prodotto)!.completo).map((m) => costi.get(m.prodotto)!.nome),
  ])].sort((a, b) => a.localeCompare(b, 'it'));
  return {
    prova: !veri && scontrini.length > 0,
    scontrini: vendite.length, annullati: annullati.size, contanti, carta, incasso, netto: nettoTot,
    medio: vendite.length ? Math.round(incasso / vendite.length) : 0,
    perGiorno: [...giorni].sort((a, b) => a[0].localeCompare(b[0])).map(([giorno, v]) => ({ giorno, ...v })),
    perCassa: [...casse].sort((a, b) => b[1].incasso - a[1].incasso).map(([cassa, v]) => ({ cassa, ...v })),
    prodotti: righe, senzaIncasso, costoVenduto, costoSenzaIncasso,
    margine: nettoTot - costoVenduto - costoSenzaIncasso,
    foodCost: nettoTot > 0 ? Math.round((costoVenduto / nettoTot) * 1000) / 10 : null,
    incompleti,
  };
}
