/**
 * Schermo sempre acceso mentre si vende: nell'app Android il plugin «Schermo»
 * (android/app/src/main/java/it/vegman/app/SchermoPlugin.java), nel browser la Wake Lock API se c'è.
 * Restituisce la funzione che lo rilascia. Non blocca mai nulla: se non si può, lo schermo fa come sempre.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

const Schermo = registerPlugin<{ acceso(o: { si: boolean }): Promise<void> }>('Schermo');
type Blocco = { release(): Promise<void> };

export function tieniSchermoAcceso(): () => void {
  if (Capacitor.isNativePlatform()) {
    Schermo.acceso({ si: true }).catch(() => undefined);
    return () => { Schermo.acceso({ si: false }).catch(() => undefined); };
  }
  let blocco: Blocco | null = null;
  let finito = false;
  const chiedi = () => {
    const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<Blocco> } }).wakeLock;
    if (!wl || document.visibilityState !== 'visible') return;
    wl.request('screen').then((b) => { if (finito) void b.release().catch(() => undefined); else blocco = b; }, () => undefined);
  };
  // Il blocco del browser cade quando la pagina va in secondo piano: si richiede al ritorno.
  const torna = () => { if (document.visibilityState === 'visible') chiedi(); };
  chiedi();
  document.addEventListener('visibilitychange', torna);
  return () => {
    finito = true;
    document.removeEventListener('visibilitychange', torna);
    if (blocco) void blocco.release().catch(() => undefined);
  };
}
