/**
 * Cassa collegata all'Agenzia vera dal telefono (solo app Android): accesso con le credenziali della
 * cassaforte, archivio invii vero (`vegman-dco`, lo stesso della prova del passo 8), nuovo accesso automatico.
 */
import { CapacitorHttp } from '@capacitor/core';
import { collegaAgenzia, conRiaccesso, type CassaAgenzia } from '../fiscal/cassaAgenzia';
import { archivioSuDispositivo } from '../fiscal/emissione';
import { BASE_DCO, trasportoNativo, type FunzioneHttp } from '../fiscal/nativo';
import { apriSessione, nuovaTraccia } from './portaleTelefono';

export async function collegaCassaVera(): Promise<CassaAgenzia> {
  await apriSessione(nuovaTraccia());
  const trasporto = conRiaccesso(trasportoNativo(CapacitorHttp.request as unknown as FunzioneHttp, BASE_DCO, 20000), async () => { await apriSessione(nuovaTraccia()); });
  const { Preferences } = await import('@capacitor/preferences');
  return collegaAgenzia(trasporto, archivioSuDispositivo(Preferences, 'vegman-dco'));
}

/** Ogni quanto si «tiene sveglia» la sessione (da regolare con la misura della durata: passo 9). */
export const MANTIENI_VIVA_MS = 10 * 60 * 1000;
