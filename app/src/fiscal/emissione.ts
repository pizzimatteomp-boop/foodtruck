/**
 * Emissione degli scontrini senza doppioni (vedi CLAUDE.md, «Regole di sicurezza»).
 *
 * Il problema: se la rete cade mentre l'Agenzia registra la vendita, non si sa se lo scontrino c'è.
 * La regola:
 *  1. prima di inviare, si annota «invio in sospeso» (con l'impronta dello scontrino) sul dispositivo;
 *  2. risposta chiara (emesso o rifiutato) → si toglie l'annotazione;
 *  3. risposta persa → si chiede all'Agenzia l'ultima vendita: se è questa, è emessa (si recupera);
 *     se è ancora la vendita precedente di questo dispositivo, non è stata emessa e si può riprovare;
 *     in ogni altro caso (nessuna vendita indicata, vendita diversa) resta in sospeso e si verifica a mano;
 *  4. se non si riesce a verificare, l'annotazione resta e NESSUNO scontrino nuovo parte finché non si chiarisce.
 * Annulli e resi non hanno «ultimo»: se la risposta si perde si resta in sospeso e si verifica a mano sul portale.
 */
import type { DocumentoLetto, documentoAnnullo, documentoVendita } from './dco';
import type { ServizioDCO } from './servizio';
import { ErroreRete, ErroreServizio, RifiutoAgenzia, SessioneScaduta } from './trasporto';

type DocumentoVendita = ReturnType<typeof documentoVendita>;
type DocumentoAnnullo = ReturnType<typeof documentoAnnullo>;

export interface Impronta {
  data: string;
  righe: { descrizione: string; quantita: number; prezzo: number; aliquota: string }[];
}

export interface InvioSospeso {
  tipo: 'V' | 'A' | 'R';
  impronta: Impronta;
  /** Ultima vendita emessa da questo dispositivo prima di questo invio (per non confonderla). */
  idtrxPrecedente: string | null;
  creatoIl: string;
  /** Per annulli/resi: progressivo del documento originale. */
  progressivoOriginale?: string;
}

/** Dove il dispositivo tiene l'annotazione: sul telefono (Preferences di Capacitor), nei test in memoria. */
export interface ArchivioInvii {
  sospeso(): Promise<InvioSospeso | null>;
  salvaSospeso(x: InvioSospeso): Promise<void>;
  togliSospeso(): Promise<void>;
  ultimaEmessa(): Promise<string | null>;
  salvaUltimaEmessa(idtrx: string): Promise<void>;
}

export type EsitoEmissione =
  | { stato: 'emesso'; idtrx: string; progressivo: string }
  | { stato: 'recuperato'; idtrx: string; progressivo: string };

/** C'è un invio non chiarito: niente scontrini nuovi finché non si risolve. */
export class InvioInSospeso extends Error {
  override name = 'InvioInSospeso';
  constructor(readonly invio: InvioSospeso) {
    super('C\'è uno scontrino di cui non si sa se è stato emesso: va verificato prima di emetterne altri.');
  }
}
/** L'invio non è arrivato all'Agenzia: niente emesso, si può riprovare. */
export class NonEmesso extends Error {
  override name = 'NonEmesso';
  constructor() { super('Lo scontrino non è stato emesso: si può riprovare.'); }
}

const n = (v: string | number) => Number(String(v).replace(',', '.'));

export function improntaDocumento(d: { documentoCommerciale: { dataOra: string; elementiContabili: { descrizioneProdotto: string; quantita: string; prezzoLordo: string; aliquotaIVA: string }[] } }): Impronta {
  return {
    data: d.documentoCommerciale.dataOra,
    righe: d.documentoCommerciale.elementiContabili.map((e) => ({ descrizione: e.descrizioneProdotto.trim(), quantita: n(e.quantita), prezzo: n(e.prezzoLordo), aliquota: e.aliquotaIVA })),
  };
}

/** Lo scontrino letto dall'Agenzia è quello dell'impronta? (stesse righe; stessa data se l'Agenzia la indica) */
export function corrisponde(letto: DocumentoLetto & { documentoCommerciale: { dataOra?: string } }, i: Impronta): boolean {
  const el = letto.documentoCommerciale.elementiContabili;
  if (letto.documentoCommerciale.dataOra && letto.documentoCommerciale.dataOra.slice(0, 10) !== i.data) return false;
  return el.length === i.righe.length && el.every((e, k) => {
    const r = i.righe[k]!;
    return e.descrizioneProdotto.trim() === r.descrizione && n(e.quantita) === r.quantita && n(e.prezzoLordo) === r.prezzo && String(e.aliquotaIVA) === r.aliquota;
  });
}

/**
 * Chiarisce un invio in sospeso. Risultato: emesso (con i dati recuperati), non emesso,
 * oppure ancora in sospeso (rete giù, o annullo/reso da verificare a mano).
 */
export async function verificaSospeso(s: ServizioDCO, a: ArchivioInvii): Promise<EsitoEmissione | null> {
  const x = await a.sospeso();
  if (!x) return null;
  if (x.tipo !== 'V') throw new InvioInSospeso(x);
  let ultima: DocumentoLetto | null;
  try { ultima = await s.ultimaVendita(); } catch { throw new InvioInSospeso(x); }
  if (ultima && ultima.idtrx !== x.idtrxPrecedente && corrisponde(ultima, x.impronta)) {
    await a.salvaUltimaEmessa(ultima.idtrx);
    await a.togliSospeso();
    return { stato: 'recuperato', idtrx: ultima.idtrx, progressivo: ultima.datiTrasmissione.numeroProgressivo };
  }
  // «Non emesso» solo se l'Agenzia indica come ultima vendita proprio quella precedente di questo dispositivo.
  // Nessuna vendita indicata, o una vendita diversa: non si può dedurre nulla → resta in sospeso (verifica a mano).
  if (ultima && x.idtrxPrecedente !== null && ultima.idtrx === x.idtrxPrecedente) {
    await a.togliSospeso();
    return null;
  }
  throw new InvioInSospeso(x);
}

export async function emettiVendita(s: ServizioDCO, a: ArchivioInvii, documento: DocumentoVendita, quando = new Date()): Promise<EsitoEmissione> {
  const vecchio = await a.sospeso();
  if (vecchio) throw new InvioInSospeso(vecchio);
  const sospeso: InvioSospeso = { tipo: 'V', impronta: improntaDocumento(documento), idtrxPrecedente: await a.ultimaEmessa(), creatoIl: quando.toISOString() };
  await a.salvaSospeso(sospeso);
  try {
    const r = await s.invia(documento);
    await a.salvaUltimaEmessa(r.idtrx);
    await a.togliSospeso();
    return { stato: 'emesso', ...r };
  } catch (e) {
    if (e instanceof RifiutoAgenzia || e instanceof SessioneScaduta) { await a.togliSospeso(); throw e; }
    if (e instanceof ErroreRete || e instanceof ErroreServizio) {
      const r = await verificaSospeso(s, a);
      if (r) return r;
      throw new NonEmesso();
    }
    throw e;
  }
}

/** Annullo o reso: in caso di risposta persa resta in sospeso (si verifica sul portale). */
export async function inviaAnnulloReso(s: ServizioDCO, a: ArchivioInvii, documento: DocumentoAnnullo, quando = new Date()): Promise<EsitoEmissione> {
  const vecchio = await a.sospeso();
  if (vecchio) throw new InvioInSospeso(vecchio);
  const tipo = documento.documentoCommerciale.resoAnnullo.tipologia as 'A' | 'R';
  await a.salvaSospeso({ tipo, impronta: improntaDocumento(documento), idtrxPrecedente: null, creatoIl: quando.toISOString(), progressivoOriginale: documento.documentoCommerciale.resoAnnullo.progressivo });
  try {
    const r = await s.invia(documento);
    await a.togliSospeso();
    return { stato: 'emesso', ...r };
  } catch (e) {
    if (e instanceof RifiutoAgenzia || e instanceof SessioneScaduta) { await a.togliSospeso(); throw e; }
    if (e instanceof ErroreRete || e instanceof ErroreServizio) throw new InvioInSospeso((await a.sospeso())!);
    throw e;
  }
}

/** Il titolare ha controllato sul portale: l'invio in sospeso non è stato emesso (oppure sì, ed è registrato a mano). */
export async function chiudiSospesoAMano(a: ArchivioInvii): Promise<void> {
  await a.togliSospeso();
}

export function archivioInMemoria(): ArchivioInvii & { stato: { sospeso: InvioSospeso | null; ultima: string | null } } {
  const stato = { sospeso: null as InvioSospeso | null, ultima: null as string | null };
  return {
    stato,
    sospeso: async () => stato.sospeso,
    salvaSospeso: async (x) => { stato.sospeso = x; },
    togliSospeso: async () => { stato.sospeso = null; },
    ultimaEmessa: async () => stato.ultima,
    salvaUltimaEmessa: async (x) => { stato.ultima = x; },
  };
}


/** Stessa forma di Preferences di Capacitor (memoria del telefono che resta anche chiudendo l'app). */
export interface MemoriaChiaveValore {
  get(o: { key: string }): Promise<{ value: string | null }>;
  set(o: { key: string; value: string }): Promise<void>;
  remove(o: { key: string }): Promise<void>;
}

/** Archivio degli invii sul telefono. */
export function archivioSuDispositivo(m: MemoriaChiaveValore, prefisso = 'vegman-dco'): ArchivioInvii {
  const S = `${prefisso}-sospeso`, U = `${prefisso}-ultima`;
  return {
    sospeso: async () => { const v = (await m.get({ key: S })).value; return v ? JSON.parse(v) as InvioSospeso : null; },
    salvaSospeso: (x) => m.set({ key: S, value: JSON.stringify(x) }),
    togliSospeso: () => m.remove({ key: S }),
    ultimaEmessa: async () => (await m.get({ key: U })).value,
    salvaUltimaEmessa: (x) => m.set({ key: U, value: x }),
  };
}
