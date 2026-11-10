/**
 * SumUp dal telefono (solo app Android). Prima di aprire SumUp si salva il pagamento in corso (righe comprese):
 * se Android chiude l'app mentre si è in SumUp, al ritorno lo scontrino si può ancora emettere.
 * I plugin non si restituiscono mai da funzioni async (vedi plugin.test.ts).
 */
import type { Riga } from '../cassa/carrello';
import { leggiRitorno, nuovoIdTransazione, urlPagamento, type EsitoSumUp } from '../cassa/sumup';

const CHIAVE = 'vegman-sumup-chiave';
const IN_CORSO = 'vegman-sumup-in-corso';
const ESITO = 'vegman-sumup-esito';

export interface PagamentoInCorso { id: string; righe: Riga[]; centesimi: number; quando: string }

async function leggi(k: string): Promise<string | null> {
  const { Preferences } = await import('@capacitor/preferences');
  return (await Preferences.get({ key: k })).value;
}
async function scrivi(k: string, v: string | null): Promise<void> {
  const { Preferences } = await import('@capacitor/preferences');
  if (v === null) await Preferences.remove({ key: k }); else await Preferences.set({ key: k, value: v });
}

export const chiaveSumUp = () => leggi(CHIAVE);
export const salvaChiaveSumUp = (v: string | null) => scrivi(CHIAVE, v?.trim() || null);

export async function pagamentoInCorso(): Promise<PagamentoInCorso | null> {
  const v = await leggi(IN_CORSO);
  return v ? JSON.parse(v) as PagamentoInCorso : null;
}
export async function esitoSalvato(): Promise<EsitoSumUp | null> {
  const v = await leggi(ESITO);
  return v ? JSON.parse(v) as EsitoSumUp : null;
}
export async function chiudiPagamento(): Promise<void> {
  await scrivi(IN_CORSO, null);
  await scrivi(ESITO, null);
}

type Ascoltatore = (e: EsitoSumUp) => void;
const ascoltatori = new Set<Ascoltatore>();

/** Da chiamare all'avvio dell'app: riceve il ritorno di SumUp (anche se l'app era stata chiusa). */
export async function ascoltaSumUp(): Promise<void> {
  const { App } = await import('@capacitor/app');
  const ricevi = async (url: string | undefined) => {
    const e = url ? leggiRitorno(url) : null;
    if (!e) return;
    await scrivi(ESITO, JSON.stringify(e));
    for (const a of ascoltatori) a(e);
  };
  await App.addListener('appUrlOpen', (d) => void ricevi(d.url));
  const avvio = await App.getLaunchUrl();
  await ricevi(avvio?.url);
}

export function quandoTornaSumUp(a: Ascoltatore): () => void {
  ascoltatori.add(a);
  return () => { ascoltatori.delete(a); };
}

/** Salva il pagamento in corso e apre SumUp. */
export async function apriSumUp(righe: Riga[], centesimi: number, titolo: string): Promise<PagamentoInCorso> {
  const chiave = await chiaveSumUp();
  const p: PagamentoInCorso = { id: nuovoIdTransazione(), righe, centesimi, quando: new Date().toISOString() };
  const url = urlPagamento({ chiave: chiave ?? '', centesimi, titolo, idTransazione: p.id });
  await scrivi(ESITO, null);
  await scrivi(IN_CORSO, JSON.stringify(p));
  const { AppLauncher } = await import('@capacitor/app-launcher');
  const { value } = await AppLauncher.canOpenUrl({ url: 'sumupmerchant://pay/1.0' });
  if (!value) { await scrivi(IN_CORSO, null); throw new Error('App SumUp non trovata su questo telefono.'); }
  await AppLauncher.openUrl({ url });
  return p;
}
