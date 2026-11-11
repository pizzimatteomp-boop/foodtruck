/**
 * Registro di emergenza (fase «Cassa», C7). Il documento commerciale online si emette solo con la rete:
 * se l'Agenzia non è raggiungibile e lo scontrino NON è partito (mai quando è «in sospeso»), la vendita
 * si annota qui, sul telefono, con data e ora; appena torna la rete si emette lo scontrino vero.
 * Resta tutto: anche le voci emesse, col numero del documento, come traccia della regolarizzazione.
 */
import { InvioInSospeso, type EsitoEmissione, type InvioSospeso } from '../fiscal/emissione';
import type { Pagamento, RigaCassa } from '../fiscal/prova';
import type { Riga } from './carrello';
import { ErroreCassa, righePerScontrino, totaleCentesimi } from './carrello';

export interface VoceEmergenza {
  /** Numero progressivo nel registro di questo telefono. */
  numero: number;
  /** Millisecondi della vendita. */
  quando: number;
  evento: string;
  cassa: string;
  righe: Riga[];
  pagamento: 'contanti' | 'elettronico';
  sumup?: string;
  /** Perché non è stato emesso subito. */
  motivo: string;
  /**
   * Inviata ma senza risposta e non verificabile (rete caduta durante l'invio): forse è emessa.
   * Prima di tutto si verifica con l'Agenzia; mai riemessa alla cieca.
   */
  daVerificare?: true;
  /** Emessa: col documento; «a mano» = trovata sul portale dal titolare. */
  emesso?: { idtrx: string; progressivo: string; quando: number; aMano?: true };
}

export type Registro = VoceEmergenza[];

/** Lettura tollerante: un registro illeggibile non deve bloccare la cassa (ma non si perde: si segnala). */
export function leggiRegistro(testo: string | null): Registro {
  if (!testo) return [];
  const v = JSON.parse(testo) as unknown;
  if (!Array.isArray(v)) throw new ErroreCassa('Registro di emergenza illeggibile.');
  return v as Registro;
}

export function annota(r: Registro, v: Omit<VoceEmergenza, 'numero' | 'emesso'>): Registro {
  if (!v.righe.length) throw new ErroreCassa('Lo scontrino è vuoto.');
  const numero = r.reduce((m, x) => Math.max(m, x.numero), 0) + 1;
  return [...r, { ...v, righe: v.righe.map((x) => ({ ...x })), numero }];
}

export const daEmettere = (r: Registro, evento?: string, cassa?: string) =>
  r.filter((x) => !x.emesso && (!evento || x.evento === evento) && (!cassa || x.cassa === cassa));

export function segnaEmessa(r: Registro, numero: number, e: { idtrx: string; progressivo: string; quando: number }): Registro {
  if (!r.some((x) => x.numero === numero && !x.emesso)) throw new ErroreCassa(`Voce ${numero} non trovata o già emessa.`);
  return r.map((x) => (x.numero === numero ? { ...x, emesso: e } : x));
}

const ora = (ms: number) => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ms);
const euro = (c: number) => `${(c / 100).toFixed(2).replace('.', ',')} €`;

/** Una riga leggibile per voce (per mostrarla o mandarla al commercialista). */
export function descriviVoce(v: VoceEmergenza): string {
  const righe = v.righe.map((x) => `${x.quantita}× ${x.descrizione}`).join(', ');
  const stato = v.emesso ? (v.emesso.aMano ? `trovato sul portale (${ora(v.emesso.quando)})` : `emesso ${v.emesso.progressivo} il ${ora(v.emesso.quando)}`)
    : v.daVerificare ? 'DA VERIFICARE' : 'DA EMETTERE';
  return `n. ${v.numero} · ${ora(v.quando)} · ${v.cassa} · ${euro(totaleCentesimi(v.righe))} ${v.pagamento === 'contanti' ? 'contanti' : 'carta'}${v.sumup ? ` (SumUp ${v.sumup})` : ''} · ${righe} · ${v.motivo} · ${stato}`;
}

/** Testo del registro intero (dal più vecchio). */
export function testoRegistro(r: Registro): string {
  return ['VegMan · registro di emergenza', ...[...r].sort((a, b) => a.numero - b.numero).map(descriviVoce)].join('\n');
}

/** Chi emette: la cassa (simulatore o, dal passo 5, l'Agenzia vera) con il motore anti-doppioni. */
export interface Emettitore {
  vendi(righe: RigaCassa[], pagamento: Pagamento): Promise<EsitoEmissione>;
  verifica(): Promise<EsitoEmissione | null>;
  sospeso(): Promise<InvioSospeso | null>;
}

export type EsitoVoce =
  | { tipo: 'emessa'; registro: Registro; voce: VoceEmergenza; idtrx: string; progressivo: string; recuperata: boolean }
  | { tipo: 'ferma'; registro: Registro; messaggio: string; aMano?: true };

/**
 * Emette (o verifica) una voce. Una voce «da verificare» non si riemette mai alla cieca:
 * si chiede all'Agenzia; se era emessa si recupera, se non lo era diventa «da emettere».
 * Gli errori dell'emissione (non emesso, rifiuto, nuovo sospeso) arrivano a chi chiama.
 */
export async function emettiVoce(r: Registro, numero: number, em: Emettitore, adesso: number): Promise<EsitoVoce> {
  let v = r.find((x) => x.numero === numero && !x.emesso);
  if (!v) throw new ErroreCassa(`Voce ${numero} non trovata o già emessa.`);
  if (v.daVerificare) {
    if (!(await em.sospeso())) {
      return { tipo: 'ferma', registro: r, aMano: true, messaggio: `La vendita n. ${v.numero} non si può più verificare in automatico: cercala sul portale dell'Agenzia (documento commerciale online → ricerca) e indica se c'è.` };
    }
    let x: EsitoEmissione | null;
    try { x = await em.verifica(); } catch (e) {
      if (e instanceof InvioInSospeso) return { tipo: 'ferma', registro: r, messaggio: `La vendita n. ${v.numero} non si può ancora verificare (rete o Agenzia): riprova tra poco.` };
      throw e;
    }
    if (x) {
      const registro = segnaEmessa(r, numero, { idtrx: x.idtrx, progressivo: x.progressivo, quando: adesso });
      return { tipo: 'emessa', registro, voce: v, idtrx: x.idtrx, progressivo: x.progressivo, recuperata: true };
    }
    // L'Agenzia conferma che non è stata emessa: diventa una voce normale.
    r = r.map((y) => (y.numero === numero ? senzaVerifica(y) : y));
    v = senzaVerifica(v);
  }
  const x = await em.vendi(righePerScontrino(v.righe), v.pagamento);
  const registro = segnaEmessa(r, numero, { idtrx: x.idtrx, progressivo: x.progressivo, quando: adesso });
  return { tipo: 'emessa', registro, voce: v, idtrx: x.idtrx, progressivo: x.progressivo, recuperata: x.stato === 'recuperato' };
}

function senzaVerifica(v: VoceEmergenza): VoceEmergenza {
  const { daVerificare: _, ...resto } = v;
  return resto;
}

/** Il titolare ha controllato sul portale: c'era (resta registrata come trovata) o non c'era (da emettere). */
export function risoltaAMano(r: Registro, numero: number, trovata: boolean, adesso: number): Registro {
  if (!r.some((x) => x.numero === numero && x.daVerificare && !x.emesso)) throw new ErroreCassa(`Voce ${numero} non da verificare.`);
  return r.map((x) => (x.numero !== numero ? x : trovata
    ? { ...senzaVerifica(x), emesso: { idtrx: '', progressivo: 'verificato a mano', quando: adesso, aMano: true } }
    : senzaVerifica(x)));
}
