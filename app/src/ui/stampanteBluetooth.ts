/**
 * Stampante termica Bluetooth (BLE): app Android con @capacitor-community/bluetooth-le, browser (Chrome/Edge)
 * con lo stesso plugin, che lì usa Web Bluetooth. La stampante scelta resta nel telefono; la stampa è sempre
 * facoltativa: se non riesce, la vendita resta valida e lo si dice.
 * (Mai restituire o attendere oggetti dei plugin da funzioni async: vedi app/plugin.test.ts.)
 */
import { aPezzi, caratteristicaScrivibile, SERVIZI_STAMPANTE } from '../stampa/escpos';

const CHIAVE = 'vegman-stampante';

interface Salvata { id: string; nome: string; servizio: string; caratteristica: string; senzaRisposta: boolean }

export class ErroreStampa extends Error {
  override name = 'ErroreStampa';
}

function leggi(): Salvata | null {
  try { return JSON.parse(localStorage.getItem(CHIAVE) ?? 'null') as Salvata | null; } catch { return null; }
}

/** Nome della stampante scelta su questo telefono (o null). */
export function stampanteSalvata(): string | null { return leggi()?.nome ?? null; }

let iniziato = false;
let collegata: string | null = null;

async function modulo(): Promise<{ ble: typeof import('@capacitor-community/bluetooth-le')['BleClient'] }> {
  const { BleClient } = await import('@capacitor-community/bluetooth-le');
  if (!iniziato) {
    try { await BleClient.initialize(); } catch (e) { throw new ErroreStampa(`Bluetooth non disponibile: ${(e as Error)?.message ?? 'attivalo e riprova'}.`); }
    iniziato = true;
  }
  return { ble: BleClient };
}

/** Sceglie e collega una stampante (serve un tocco: mostra l'elenco dei dispositivi). */
export async function collegaStampante(): Promise<string> {
  const { ble } = await modulo();
  let d: { deviceId: string; name?: string };
  try { d = await ble.requestDevice({ optionalServices: SERVIZI_STAMPANTE }); } catch (e) {
    throw new ErroreStampa(/cancel/i.test((e as Error)?.message ?? '') ? 'Nessuna stampante scelta.' : `Ricerca non riuscita: ${(e as Error)?.message ?? ''}`);
  }
  await ble.connect(d.deviceId, () => { collegata = null; });
  collegata = d.deviceId;
  const servizi = await ble.getServices(d.deviceId);
  const scelta = caratteristicaScrivibile(servizi.map((s) => ({ uuid: s.uuid, caratteristiche: s.characteristics.map((c) => ({ uuid: c.uuid, scrive: c.properties.write || c.properties.writeWithoutResponse })) })));
  if (!scelta) { await ble.disconnect(d.deviceId).catch(() => undefined); collegata = null; throw new ErroreStampa('Questo dispositivo non sembra una stampante (nessun canale di scrittura).'); }
  const car = servizi.find((s) => s.uuid === scelta.servizio)!.characteristics.find((c) => c.uuid === scelta.caratteristica)!;
  const s: Salvata = { id: d.deviceId, nome: d.name || 'Stampante', ...scelta, senzaRisposta: !car.properties.write };
  localStorage.setItem(CHIAVE, JSON.stringify(s));
  return s.nome;
}

export async function dimenticaStampante(): Promise<void> {
  const s = leggi();
  localStorage.removeItem(CHIAVE);
  if (s && collegata) { const { ble } = await modulo(); await ble.disconnect(s.id).catch(() => undefined); }
  collegata = null;
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Manda i byte alla stampante scelta (si ricollega da sola se serve). */
export async function stampa(bytes: Uint8Array): Promise<void> {
  const s = leggi();
  if (!s) throw new ErroreStampa('Nessuna stampante scelta: collegala dall\'apertura della cassa.');
  const { ble } = await modulo();
  if (collegata !== s.id) {
    try {
      // Nel browser il dispositivo va ritrovato tra quelli già autorizzati.
      await ble.getDevices([s.id]).catch(() => undefined);
      await ble.connect(s.id, () => { collegata = null; });
      collegata = s.id;
    } catch (e) { throw new ErroreStampa(`Stampante «${s.nome}» non raggiungibile (accesa e vicina?): ${(e as Error)?.message ?? ''}`); }
  }
  try {
    for (const pezzo of aPezzi(bytes)) {
      const v = new DataView(pezzo.buffer, pezzo.byteOffset, pezzo.byteLength);
      if (s.senzaRisposta) { await ble.writeWithoutResponse(s.id, s.servizio, s.caratteristica, v); await pausa(25); } else await ble.write(s.id, s.servizio, s.caratteristica, v);
    }
  } catch (e) {
    collegata = null;
    throw new ErroreStampa(`Stampa interrotta: ${(e as Error)?.message ?? 'riprova'}.`);
  }
}
