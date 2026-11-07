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

const preferenze = async () => (await import('@capacitor/preferences')).Preferences;

export async function accessoBloccato(): Promise<boolean> {
  return (await (await preferenze()).get({ key: BLOCCO })).value === '1';
}
export async function sbloccaAccesso(): Promise<void> {
  await (await preferenze()).remove({ key: BLOCCO });
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
  if (await accessoBloccato()) throw new AccessoNonPossibile('L\'ultimo accesso è stato rifiutato: controlla le credenziali e sblocca da «Cassa · prova».');
  t.annota('Controllo blocco');
  t.allInizio?.('Lettura credenziali dalla cassaforte');
  const cred = await (await deposito()).leggi();
  t.annota('Lettura credenziali dalla cassaforte', cred ? 'presenti' : 'assenti');
  if (!cred) throw new AccessoNonPossibile('Credenziali Fisconline non salvate su questo telefono (si inseriscono in «Cassa · prova»).');
  try {
    await entraNelPortale(t, cred);
  } catch (e) {
    if (e instanceof AccessoRifiutato) await (await preferenze()).set({ key: BLOCCO, value: '1' });
    throw e;
  }
  return scegliMeStesso(t, cred).then(() => true, () => false);
}
