/** Pannello «Persone» del titolare: elenco, cambio ruolo, attiva/disattiva, abilitazione con codice. */
import type { Firestore } from 'firebase/firestore';
import type { Profilo } from '../firebase/profilo';
import { RUOLI, type Ruolo } from '../firebase/ruoli';
import { elencaPersone, ErrorePersona, preparaPersona, salvaPersona } from '../persone/persone';
import { el, pulsante } from './dom';

const NOME_RUOLO: Record<Ruolo, string> = { titolare: 'Titolare', cassa: 'Cassa', team: 'Team' };

function sceltaRuolo(attuale: Ruolo | '', etichetta: string): HTMLSelectElement {
  const s = el('select');
  s.setAttribute('aria-label', etichetta);
  if (!attuale) s.append(Object.assign(el('option', '', 'Scegli il ruolo…'), { value: '' }));
  for (const r of RUOLI) s.append(Object.assign(el('option', '', NOME_RUOLO[r]), { value: r, selected: r === attuale }));
  return s;
}

function messaggio(e: unknown): string {
  if (e instanceof ErrorePersona) return e.message;
  return (e as { code?: string }).code === 'permission-denied' ? 'Operazione non permessa.' : 'Salvataggio non riuscito: riprova.';
}

export function pannelloPersone(db: Firestore, titolareUid: string): HTMLElement {
  const sezione = el('section', 'pannello');
  sezione.setAttribute('aria-label', 'Persone');
  const lista = el('ul', 'persone');
  const esito = el('p', 'esito');
  esito.setAttribute('role', 'status');

  async function salva(p: { codice: string; nome: string; email: string; ruolo: string; attivo: boolean }, fatto: string) {
    esito.className = 'esito';
    try {
      const { uid, dati } = preparaPersona(p, titolareUid);
      await salvaPersona(db, uid, dati);
      esito.textContent = fatto;
      await aggiorna();
      return true;
    } catch (e) {
      esito.className = 'esito errore';
      esito.textContent = messaggio(e);
      return false;
    }
  }

  function riga(p: Profilo): HTMLLIElement {
    const li = el('li', p.attivo ? '' : 'disattivo');
    const testa = el('div', 'nome');
    testa.append(el('strong', '', p.nome || '(senza nome)'));
    if (p.uid === titolareUid) testa.append(el('span', 'tu', ' · tu'));
    li.append(testa);
    if (p.email) li.append(el('small', '', p.email));
    if (p.uid === titolareUid) {
      li.append(el('small', '', NOME_RUOLO[p.ruolo]));
      return li;
    }
    const comandi = el('div', 'comandi');
    const ruolo = sceltaRuolo(p.ruolo, `Ruolo di ${p.nome}`);
    ruolo.addEventListener('change', () =>
      void salva({ ...p, codice: p.uid, ruolo: ruolo.value }, `${p.nome}: ruolo ${NOME_RUOLO[ruolo.value as Ruolo]}.`));
    const attiva = pulsante(p.attivo ? 'Disattiva' : 'Riattiva', 'secondario piccolo', () =>
      salva({ ...p, codice: p.uid, attivo: !p.attivo }, `${p.nome} ${p.attivo ? 'disattivato' : 'riattivato'}.`));
    comandi.append(ruolo, attiva);
    li.append(comandi);
    return li;
  }

  async function aggiorna(): Promise<void> {
    try {
      const persone = await elencaPersone(db);
      lista.replaceChildren(...persone.map(riga));
    } catch (e) {
      esito.className = 'esito errore';
      esito.textContent = messaggio(e);
    }
  }

  // Modulo per abilitare una persona nuova con il codice che vede sulla sua schermata.
  const modulo = el('form', 'nuova');
  const codice = Object.assign(el('input'), { placeholder: 'Codice utente', autocomplete: 'off', required: true });
  const nome = Object.assign(el('input'), { placeholder: 'Nome', required: true });
  const email = Object.assign(el('input'), { placeholder: 'Email (facoltativa)', type: 'email' });
  codice.setAttribute('aria-label', 'Codice utente');
  nome.setAttribute('aria-label', 'Nome');
  email.setAttribute('aria-label', 'Email');
  const ruolo = sceltaRuolo('', 'Ruolo della persona nuova');
  const invia = Object.assign(el('button', 'primario', 'Abilita'), { type: 'submit' });
  modulo.append(el('h3', '', 'Abilita una persona'), codice, nome, email, ruolo, invia);
  modulo.addEventListener('submit', (ev) => {
    ev.preventDefault();
    invia.disabled = true;
    void salva({ codice: codice.value, nome: nome.value, email: email.value, ruolo: ruolo.value, attivo: true },
      `${nome.value.trim()} abilitato.`).then((ok) => {
      invia.disabled = false;
      if (ok) modulo.reset();
    });
  });

  sezione.append(el('h2', '', 'Persone'), lista, esito, modulo);
  void aggiorna();
  return sezione;
}
