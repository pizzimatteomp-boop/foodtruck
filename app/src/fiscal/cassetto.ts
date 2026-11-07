/**
 * Fatture ricevute dal cassetto fiscale (Fatture e Corrispettivi), dopo l'accesso al portale.
 * Vedi CLAUDE.md, «Fatture e Corrispettivi: cosa sappiamo». Solo lettura: elenco e scaricamento dei file.
 */
import { intestazione, IVASERVIZI, ts, type RispostaWeb, type Traccia } from './portale';

/** Il portale accetta al massimo 93 giorni, estremi compresi (oltre risponde con un elenco vuoto, senza errore). */
export const GIORNI_MASSIMI = 93;

const GIORNO = 86400000;
const comeData = (iso: string) => new Date(`${iso}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** aaaa-mm-gg → ggmmaaaa */
export const perPortale = (data: string) => `${data.slice(8, 10)}${data.slice(5, 7)}${data.slice(0, 4)}`;

/** Spezza un periodo (date aaaa-mm-gg, estremi compresi) in tratti di al massimo 93 giorni. */
export function periodi(dal: string, al: string): { dal: string; al: string }[] {
  const fine = comeData(al);
  const out: { dal: string; al: string }[] = [];
  for (let i = comeData(dal); i <= fine;) {
    const f = new Date(Math.min(i.getTime() + (GIORNI_MASSIMI - 1) * GIORNO, fine.getTime()));
    out.push({ dal: iso(i), al: iso(f) });
    i = new Date(f.getTime() + GIORNO);
  }
  return out;
}

export interface FatturaCassetto {
  /** tipoInvio + idFattura (es. FPR12345678901): serve a scaricare il file. */
  chiave: string;
  numero: string;
  /** aaaa-mm-gg */
  data: string;
  partitaIva: string;
  fornitore: string;
}

export class ErroreCassetto extends Error {
  override name = 'ErroreCassetto';
}

async function codici(t: Traccia): Promise<Record<string, string>> {
  const r = await t.chiama('Codici per le fatture', { url: `${IVASERVIZI}/cons/cons-services/sc/tokenB2BCookie/get?${ts()}`, metodo: 'GET' });
  const b2b = intestazione(r.intestazioni, 'x-b2bcookie');
  const token = intestazione(r.intestazioni, 'x-token');
  if (r.stato !== 200 || !b2b || !token) throw new ErroreCassetto(`Il cassetto fiscale non ha dato i codici di accesso (risposta ${r.stato}).`);
  return { 'x-b2bcookie': b2b, 'x-token': token, Accept: 'application/json, text/plain, */*' };
}

function leggiElenco(x: RispostaWeb): FatturaCassetto[] {
  let j: { fatture?: unknown };
  try { j = JSON.parse(x.testo) as { fatture?: unknown }; } catch { throw new ErroreCassetto('Elenco delle fatture non leggibile.'); }
  if (x.stato !== 200 || !Array.isArray(j.fatture)) throw new ErroreCassetto(`Elenco delle fatture non disponibile (risposta ${x.stato}).`);
  return (j.fatture as Record<string, unknown>[]).flatMap((f) => {
    const id = String(f.idFattura ?? '');
    const tipo = String(f.tipoInvio ?? '');
    if (!/^\d{5,20}$/.test(id) || !/^[A-Z]{2,5}$/.test(tipo)) return [];
    return [{
      chiave: `${tipo}${id}`, numero: String(f.numeroFattura ?? ''), data: String(f.dataFattura ?? '').slice(0, 10),
      partitaIva: String(f.pivaEmittente ?? ''), fornitore: String(f.denominazioneEmittente ?? ''),
    }];
  });
}

/** Elenco delle fatture ricevute nel periodo (per data di ricezione), spezzato da solo in tratti di 93 giorni. */
export async function elencoRicevute(t: Traccia, dal: string, al: string): Promise<FatturaCassetto[]> {
  const viste = new Map<string, FatturaCassetto>();
  for (const p of periodi(dal, al)) {
    const h = await codici(t);
    const r = await t.chiama(`Elenco fatture ${p.dal} → ${p.al}`, {
      url: `${IVASERVIZI}/cons/cons-services/rs/fe/ricevute/dal/${perPortale(p.dal)}/al/${perPortale(p.al)}/ricerca/ricezione?${ts()}`,
      metodo: 'GET', intestazioni: h,
    }, (x) => { try { const n = (JSON.parse(x.testo) as { fatture?: unknown[] }).fatture?.length; return n === undefined ? undefined : `${n} fatture`; } catch { return undefined; } });
    for (const f of leggiElenco(r)) viste.set(f.chiave, f);
  }
  return [...viste.values()].sort((a, b) => a.data.localeCompare(b.data));
}

/** Già nell'app? (stessa partita IVA del fornitore, stesso numero e stessa data) */
export function giaPresente(f: FatturaCassetto, esistenti: readonly { partitaIva?: string; numero: string; data: string }[]): boolean {
  const n = (s: string) => s.trim().toUpperCase();
  return esistenti.some((e) => n(e.numero) === n(f.numero) && e.data === f.data && (!e.partitaIva || !f.partitaIva || e.partitaIva.replace(/^IT/i, '') === f.partitaIva.replace(/^IT/i, '')));
}

/** Scarica il file di una fattura (di solito .xml.p7m firmato). */
export async function scaricaFattura(t: Traccia, f: FatturaCassetto): Promise<{ nome: string; byte: Uint8Array }> {
  const h = await codici(t);
  const r = await t.chiama(`File fattura ${f.data}`, {
    url: `${IVASERVIZI}/cons/cons-services/rs/fatture/file/${encodeURIComponent(f.chiave)}?tipoFile=FILE_FATTURA&download=1&${ts()}`,
    metodo: 'GET', intestazioni: { ...h, Accept: '*/*' }, binario: true,
  }, (x) => `${x.byte?.length ?? 0} byte`);
  if (r.stato !== 200 || !r.byte?.length) throw new ErroreCassetto(`File della fattura n. ${f.numero} non scaricato (risposta ${r.stato}).`);
  const disp = intestazione(r.intestazioni, 'content-disposition') ?? '';
  const nome = (/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disp)?.[1] ?? '').replace(/[^\w.-]/g, '_').slice(0, 100);
  return { nome: nome || `${f.chiave}.xml.p7m`, byte: r.byte };
}
