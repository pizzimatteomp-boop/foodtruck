/**
 * Eventi dal Google Sheet «CALENDARIO 2027» (passo P5, deciso da Matteo il 13/11/2026): la scheda «App»
 * prende da sola gli eventi «Confermato» dalla scheda «Eventi 2027» ed è pubblicata sul web come CSV.
 * Qui si legge il CSV, si riconoscono le colonne dal titolo e si trovano gli eventi nuovi (niente doppioni).
 * Modulo puro e testato.
 */
import { preparaEvento, type Evento } from './eventi';

/** CSV → righe di celle (virgolette doppie, a capo dentro le celle, separatore virgola). */
export function leggiCsv(testo: string): string[][] {
  const righe: string[][] = [];
  let riga: string[] = [];
  let cella = '';
  let tra = false;
  const t = testo.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (tra) {
      if (c === '"') { if (t[i + 1] === '"') { cella += '"'; i++; } else tra = false; } else cella += c;
    } else if (c === '"') tra = true;
    else if (c === ',') { riga.push(cella); cella = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      riga.push(cella); righe.push(riga); riga = []; cella = '';
    } else cella += c;
  }
  if (cella !== '' || riga.length) { riga.push(cella); righe.push(riga); }
  return righe.filter((r) => r.some((x) => x.trim() !== ''));
}

/** «13/02/2027», «13/2/27», «2027-02-13» → «2027-02-13»; altrimenti null. */
export function dataIso(testo: string): string | null {
  const t = testo.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (!m) return null;
  const anno = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  const g = Number(m[1]), mese = Number(m[2]);
  if (mese < 1 || mese > 12 || g < 1 || g > 31) return null;
  return `${anno}-${String(mese).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
}

/** «3.196 €», «€ 3.196,50», «3196» → 3196 / 3196.5; vuoto o non numero → 0. */
export function importo(testo: string): number {
  const t = testo.replace(/[€\s]/g, '');
  if (!t) return 0;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

/** Paese dal luogo: «San Marino (RSM)» o «(SM)» → SM; altrimenti IT. */
export function paeseDaLuogo(luogo: string): string {
  return /\((RSM|SM)\)\s*$/i.test(luogo.trim()) || /^san marino$/i.test(luogo.trim()) ? 'SM' : 'IT';
}

export interface EventoCalendario { nome: string; dal: string; al: string; luogo?: string; paese: string; fatturato: number }
export interface LetturaCalendario { eventi: EventoCalendario[]; scartate: string[] }

const norm = (s: string) => s.trim().toLowerCase();

/** Dalle righe del CSV agli eventi: colonne riconosciute dal titolo (Evento, Dal, Al, Luogo…, Fatturato previsto…, Incasso…). */
export function eventiDalCalendario(righe: readonly string[][]): LetturaCalendario {
  const [testa, ...dati] = righe;
  if (!testa) return { eventi: [], scartate: [] };
  const h = testa.map(norm);
  const col = (prova: (x: string) => boolean) => h.findIndex(prova);
  const cNome = col((x) => x === 'evento' || x === 'nome');
  const cDal = col((x) => x === 'dal');
  const cAl = col((x) => x === 'al');
  const cLuogo = col((x) => x.startsWith('luogo'));
  const cPrev = col((x) => x.startsWith('fatturato previsto'));
  const cInc = col((x) => x.startsWith('incasso'));
  if (cNome < 0 || cDal < 0) return { eventi: [], scartate: ['Nel calendario mancano le colonne «Evento» e «Dal».'] };
  const eventi: EventoCalendario[] = [];
  const scartate: string[] = [];
  for (const r of dati) {
    const nome = (r[cNome] ?? '').trim();
    if (!nome) continue;
    const dal = dataIso(r[cDal] ?? '');
    const al = cAl >= 0 ? dataIso(r[cAl] ?? '') ?? dal : dal;
    if (!dal || !al) { scartate.push(`${nome}: date mancanti o non leggibili`); continue; }
    const luogo = cLuogo >= 0 ? (r[cLuogo] ?? '').trim() : '';
    try {
      const e = preparaEvento({ nome, dal, al: al < dal ? dal : al, luogo, paese: paeseDaLuogo(luogo) });
      const prev = cPrev >= 0 ? importo(r[cPrev] ?? '') : 0;
      eventi.push({ nome: e.nome, dal: e.dal, al: e.al, ...(e.luogo ? { luogo: e.luogo } : {}), paese: e.paese, fatturato: prev || (cInc >= 0 ? importo(r[cInc] ?? '') : 0) });
    } catch (err) {
      scartate.push(`${nome}: ${(err as Error).message}`);
    }
  }
  return { eventi, scartate };
}

const chiaveEvento = (e: Pick<Evento, 'nome' | 'dal'>) => `${norm(e.nome)}|${e.dal}`;

/** Eventi del calendario non ancora nell'app (stesso nome e stesso primo giorno = già presente). */
export function eventiNuovi(calendario: readonly EventoCalendario[], esistenti: readonly Pick<Evento, 'nome' | 'dal'>[]): EventoCalendario[] {
  const ci = new Set(esistenti.map(chiaveEvento));
  const visti = new Set<string>();
  return calendario.filter((e) => { const k = chiaveEvento(e); if (ci.has(k) || visti.has(k)) return false; visti.add(k); return true; });
}

/** Solo indirizzi di Google Fogli pubblicati sul web (output=csv). */
export function indirizzoValido(url: string): boolean {
  return /^https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[\w-]+\/pub\?.*output=csv/.test(url.trim());
}
