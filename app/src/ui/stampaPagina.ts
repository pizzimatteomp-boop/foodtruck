/**
 * Stampa della pagina: nel browser window.print(); nell'app Android il servizio di stampa di Android
 * (plugin «Stampa» in android/app/src/main/java/it/vegman/app/StampaPlugin.java), perché lì window.print() non fa nulla.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

const Stampa = registerPlugin<{ stampa(o: { titolo: string }): Promise<void> }>('Stampa');

export function stampaPagina(titolo = 'VegMan'): void {
  if (Capacitor.isNativePlatform()) {
    Stampa.stampa({ titolo }).catch(() => window.print());
    return;
  }
  window.print();
}
