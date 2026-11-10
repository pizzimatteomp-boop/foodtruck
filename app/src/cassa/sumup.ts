/**
 * Pagamento con carta tramite l'app SumUp («Payment Switch», vedi CLAUDE.md, «SumUp»):
 * la cassa apre SumUp con l'importo, SumUp torna su vegman://sumup con l'esito.
 * Fonte: github.com/sumup/sumup-android-api (parametri e risposte).
 */
export const APP_ID = 'it.vegman.app';
export const RITORNO = 'vegman://sumup';

export class ErroreSumUp extends Error {
  override name = 'ErroreSumUp';
}

/** Indirizzo che apre SumUp per incassare `centesimi` euro. */
export function urlPagamento(a: { chiave: string; centesimi: number; titolo: string; idTransazione: string }): string {
  const chiave = a.chiave.trim();
  // Qualunque carattere stampabile senza spazi (le chiavi recenti sono tipo «sup_afk_…»).
  if (!/^[\x21-\x7E]{8,200}$/.test(chiave)) throw new ErroreSumUp('Chiave SumUp mancante o non valida (impostala in «Cassa · prova»).');
  if (!Number.isInteger(a.centesimi) || a.centesimi <= 0) throw new ErroreSumUp('Importo non valido per il pagamento con carta.');
  const importo = (a.centesimi / 100).toFixed(2);
  const p = new URLSearchParams({
    'affiliate-key': chiave,
    'app-id': APP_ID,
    total: importo,
    amount: importo, // per le versioni dell'app SumUp precedenti alla 1.88
    currency: 'EUR',
    title: a.titolo.slice(0, 60),
    'foreign-tx-id': a.idTransazione,
    'skip-screen-success': 'true',
    callback: RITORNO,
  });
  return `sumupmerchant://pay/1.0?${p.toString()}`;
}

export type EsitoSumUp =
  | { esito: 'pagato'; codice: string; idTransazione: string; messaggio: string }
  | { esito: 'non pagato'; causa: string; idTransazione: string; messaggio: string };

/** Legge il ritorno di SumUp (vegman://sumup?smp-status=…); null se l'indirizzo non è il ritorno di SumUp. */
export function leggiRitorno(url: string): EsitoSumUp | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'vegman:' || !/^\/*sumup/.test(`${u.host}${u.pathname}`)) return null;
  const q = u.searchParams;
  const stato = q.get('smp-status');
  const idTransazione = q.get('foreign-tx-id') ?? '';
  const messaggio = q.get('smp-message') ?? '';
  if (stato === 'success') return { esito: 'pagato', codice: q.get('smp-tx-code') ?? '', idTransazione, messaggio };
  return { esito: 'non pagato', causa: q.get('smp-failure-cause') ?? (stato ?? 'sconosciuta'), idTransazione, messaggio };
}

/** Motivo leggibile di un pagamento non riuscito. */
export function spiegaCausa(causa: string): string {
  return {
    'transaction-failed': 'pagamento non riuscito o annullato',
    'geolocation-required': 'SumUp chiede la posizione: attivala per l\'app SumUp',
    'invalid-param': 'dati del pagamento non validi',
    'invalid-token': 'chiave SumUp non valida o non collegata a it.vegman.app',
  }[causa] ?? `esito «${causa}»`;
}

/** Codice univoco della transazione (≤128 caratteri, come chiede SumUp). */
export function nuovoIdTransazione(adesso = Date.now(), caso = Math.random): string {
  return `vegman-${adesso.toString(36)}-${Math.floor(caso() * 36 ** 6).toString(36).padStart(6, '0')}`;
}
