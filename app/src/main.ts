/** Avvio dell'app: schermata di accesso e, per il titolare, gestione delle persone. Provato nel browser (tests/browser). */
import { accediConGoogle, accediProva, avviaFirebase, esci, osservaAccesso } from './firebase/accesso';
import type { Ambiente } from './firebase/config';
import { el, pulsante } from './ui/dom';
import { pannelloPersone } from './ui/pannello-persone.dom';
import { messaggioErrore, vista, type Azione, type StatoSchermata } from './ui/schermata';
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
const radice = document.getElementById('app')!;
let stato: StatoSchermata = { stato: 'avvio' };
let uidCorrente = '';

const ETICHETTE: Record<Azione, string> = { accedi: 'Accedi con Google', esci: 'Esci', 'copia-codice': 'Copia il codice' };

async function esegui(azione: Azione, b: HTMLButtonElement): Promise<void> {
  if (azione === 'accedi') {
    b.disabled = true;
    try {
      await accediConGoogle(servizi);
    } catch (e) {
      mostra({ stato: 'fuori', errore: messaggioErrore((e as { code?: string }).code ?? '') });
    }
  } else if (azione === 'esci') {
    await esci(servizi);
  } else if (stato.stato === 'non-abilitato') {
    await navigator.clipboard.writeText(stato.uid);
    b.textContent = 'Copiato ✓';
  }
}

function mostra(nuovo: StatoSchermata): void {
  stato = nuovo;
  const v = vista(stato);
  const scheda = el('main', 'scheda');
  scheda.append(el('h1', '', v.titolo));
  for (const r of v.righe) scheda.append(el('p', '', r));
  if (v.codice) scheda.append(el('code', 'codice', v.codice));
  if (v.errore) scheda.append(el('p', 'errore', v.errore));
  for (const a of v.azioni) scheda.append(pulsante(ETICHETTE[a], a === 'accedi' ? 'primario' : 'secondario', (b) => esegui(a, b)));
  if (stato.stato === 'dentro' && stato.ruolo === 'titolare') scheda.append(pannelloPersone(servizi.db, uidCorrente));
  if (ambiente === 'prova') scheda.append(el('p', 'ambiente', 'Ambiente di PROVA · dati non reali'));
  radice.replaceChildren(scheda);
}

mostra(stato);
osservaAccesso(servizi, (s) => {
  if (s.stato === 'fuori') return mostra({ stato: 'fuori' });
  if (s.stato === 'non-abilitato') return mostra(s);
  uidCorrente = s.utente.uid;
  mostra({ stato: 'dentro', nome: s.profilo.nome, email: s.profilo.email || (s.utente.email ?? ''), ruolo: s.profilo.ruolo });
});
