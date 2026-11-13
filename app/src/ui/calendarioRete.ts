/** Scarica il CSV del calendario: nell'app Android con l'HTTP nativo (niente blocchi del browser), altrimenti fetch. */
import { Capacitor, CapacitorHttp } from '@capacitor/core';

export async function scaricaCalendario(url: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.get({ url, responseType: 'text', connectTimeout: 20000, readTimeout: 20000 });
    if (r.status !== 200) throw new Error(`risposta ${r.status}`);
    return typeof r.data === 'string' ? r.data : String(r.data ?? '');
  }
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`risposta ${r.status}`);
  return r.text();
}
