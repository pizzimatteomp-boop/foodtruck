/** Avvio dell'app: schermata di accesso. Provato nel browser (vedi README). */
import { accediConGoogle, avviaFirebase, esci, osservaAccesso } from './firebase/accesso';
import type { Ambiente } from './firebase/config';
import { messaggioErrore, vista, type Azione, type StatoSchermata } from './ui/schermata';
import './ui/stile.css';

const ambiente: Ambiente = import.meta.env.VITE_AMBIENTE === 'produzione' ? 'produzione' : 'prova';
const servizi = avviaFirebase(ambiente);
const radice = document.getElementById('app')!;
let stato: StatoSchermata = { stato: 'avvio' };

const ETICHETTE: Record<Azione, string> = { accedi: 'Accedi con Google', esci: 'Esci', 'copia-codice': 'Copia il codice' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, testo?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo !== undefined) e.textContent = testo;
  return e;
}

async function esegui(azione: Azione, pulsante: HTMLButtonElement): Promise<void> {
  if (azione === 'accedi') {
    pulsante.disabled = true;
    try {
      await accediConGoogle(servizi);
    } catch (e) {
      mostra({ stato: 'fuori', errore: messaggioErrore((e as { code?: string }).code ?? '') });
    }
  } else if (azione === 'esci') {
    await esci(servizi);
  } else if (stato.stato === 'non-abilitato') {
    await navigator.clipboard.writeText(stato.uid);
    pulsante.textContent = 'Copiato ✓';
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
  for (const a of v.azioni) {
    const b = el('button', a === 'accedi' ? 'primario' : 'secondario', ETICHETTE[a]);
    b.type = 'button';
    b.addEventListener('click', () => void esegui(a, b));
    scheda.append(b);
  }
  if (ambiente === 'prova') scheda.append(el('p', 'ambiente', 'Ambiente di PROVA · dati non reali'));
  radice.replaceChildren(scheda);
}

mostra(stato);
osservaAccesso(servizi, (s) => {
  if (s.stato === 'fuori') mostra({ stato: 'fuori' });
  else if (s.stato === 'non-abilitato') mostra(s);
  else mostra({ stato: 'dentro', nome: s.profilo.nome, email: s.profilo.email || (s.utente.email ?? ''), ruolo: s.profilo.ruolo });
});
