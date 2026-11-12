/**
 * Sessione col portale dell'Agenzia dal telefono (solo app Android): credenziali dalla cassaforte,
 * accesso, scelta «Me stesso». Dopo un rifiuto l'app si blocca e non riprova finché il titolare non sblocca.
 */
import { CapacitorHttp } from '@capacitor/core';
import { cassaforte } from '../fiscal/cassaforte';
import { webNativo, type FunzioneHttp } from '../fiscal/nativo';
import { AccessoRifiutato, entraNelPortale, scegliMeStesso, Traccia } from '../fiscal/portale';

const BLOCCO = 'vegman-accesso-bloccato';

export async function deposito() {
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
  await SecureStorage.setKeyPrefix('vegman_');
  return cassaforte({ get: (k) => SecureStorage.get(k), set: (k, v) => SecureStorage.set(k, v), remove: (k) => SecureStorage.remove(k) });
}

// Attenzione: i plugin di Capacitor non vanno mai restituiti da una funzione async (né passati a await):
// sono oggetti che rispondono a qualunque nome, anche «then», e l'attesa non finirebbe mai.
export async function accessoBloccato(): Promise<boolean> {
  const { Preferences } = await import('@capacitor/preferences');
  return (await Preferences.get({ key: BLOCCO })).value === '1';
}
export async function sbloccaAccesso(): Promise<void> {
  const { Preferences } = await import('@capacitor/preferences');
  await Preferences.remove({ key: BLOCCO });
}
async function bloccaAccesso(): Promise<void> {
  const { Preferences } = await import('@capacitor/preferences');
  await Preferences.set({ key: BLOCCO, value: '1' });
}

export class AccessoNonPossibile extends Error {
  override name = 'AccessoNonPossibile';
}

export function nuovaTraccia(): Traccia {
  return new Traccia(webNativo(CapacitorHttp.request as unknown as FunzioneHttp, navigator.userAgent, 20000));
}

/** Entra nel portale. Restituisce se la scelta «Me stesso» è riuscita (dopo l'accesso si va avanti comunque). */
export async function apriSessione(t: Traccia): Promise<boolean> {
  t.allInizio?.('Controllo blocco');
  if (await accessoBloccato()) throw new AccessoNonPossibile('L\'ultimo accesso è stato rifiutato: controlla le credenziali sul portale e salvale di nuovo (Cassa › Impostazioni di questo telefono).');
  t.annota('Controllo blocco');
  t.allInizio?.('Lettura credenziali dalla cassaforte');
  const cred = await (await deposito()).leggi();
  t.annota('Lettura credenziali dalla cassaforte', cred ? 'presenti' : 'assenti');
  if (!cred) throw new AccessoNonPossibile('Credenziali Fisconline non salvate su questo telefono (il titolare le inserisce in Cassa › Impostazioni di questo telefono).');
  try {
    await entraNelPortale(t, cred);
  } catch (e) {
    if (e instanceof AccessoRifiutato) await bloccaAccesso();
    throw e;
  }
  return scegliMeStesso(t, cred).then(() => true, () => false);
}
