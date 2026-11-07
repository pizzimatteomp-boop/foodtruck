/** Avvio dell'app. */
import { render } from 'preact';
import { Capacitor } from '@capacitor/core';
import { App } from './app/App';
import { accediProva, avviaFirebase } from './firebase/accesso';
import type { Ambiente } from './firebase/config';
import './ui/stile.css';

const ambiente: Ambiente = import.meta.env.VITE_AMBIENTE === 'produzione' ? 'produzione' : 'prova';
const emulatori = import.meta.env.VITE_EMULATORI === '1';
const servizi = avviaFirebase(ambiente, { emulatori });

// Solo nelle prove automatiche (emulatori): accesso simulato. Nel pacchetto pubblicato questo codice non c'è.
if (emulatori) {
  (window as unknown as { vegmanProva: unknown }).vegmanProva = {
    accedi: (u: { sub: string; email: string; nome: string }) => accediProva(servizi, u),
  };
}

// App installabile e apribile senza rete: il service worker conserva le pagine dell'app.
// Nell'app Android le pagine sono già dentro il pacchetto: niente service worker.
if (import.meta.env.PROD && 'serviceWorker' in navigator && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}

render(<App servizi={servizi} ambiente={ambiente} />, document.getElementById('app')!);
