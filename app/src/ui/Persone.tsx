/** Pagina «Persone» del titolare: elenco, cambio ruolo, attiva/disattiva, abilitazione con codice. */
import type { Firestore } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { Profilo } from '../firebase/profilo';
import { RUOLI, type Ruolo } from '../firebase/ruoli';
import { ErrorePersona, preparaPersona } from '../persone/persone';
import { elencaPersone, salvaPersona } from '../persone/persone.db';

const NOME_RUOLO: Record<Ruolo, string> = { titolare: 'Titolare', cassa: 'Cassa', team: 'Team' };
type Esito = { testo: string; errore: boolean } | null;

function messaggio(e: unknown): string {
  if (e instanceof ErrorePersona) return e.message;
  return (e as { code?: string }).code === 'permission-denied' ? 'Operazione non permessa.' : 'Salvataggio non riuscito: riprova.';
}

function SceltaRuolo({ valore, etichetta, onChange }: { valore: string; etichetta: string; onChange: (r: string) => void }) {
  return (
    <select aria-label={etichetta} value={valore} onChange={(e) => onChange(e.currentTarget.value)}>
      {!valore && <option value="">Scegli il ruolo…</option>}
      {RUOLI.map((r) => <option key={r} value={r}>{NOME_RUOLO[r]}</option>)}
    </select>
  );
}

export function Persone({ db, titolareUid }: { db: Firestore; titolareUid: string }) {
  const [persone, setPersone] = useState<Profilo[]>([]);
  const [esito, setEsito] = useState<Esito>(null);
  const [nuova, setNuova] = useState({ codice: '', nome: '', email: '', ruolo: '' });
  const [salvando, setSalvando] = useState(false);

  const aggiorna = useCallback(async () => {
    try {
      setPersone(await elencaPersone(db));
    } catch (e) {
      setEsito({ testo: messaggio(e), errore: true });
    }
  }, [db]);
  useEffect(() => void aggiorna(), [aggiorna]);

  async function salva(p: { codice: string; nome: string; email: string; ruolo: string; attivo: boolean }, fatto: string) {
    try {
      const { uid, dati } = preparaPersona(p, titolareUid);
      await salvaPersona(db, uid, dati);
      setEsito({ testo: fatto, errore: false });
      await aggiorna();
      return true;
    } catch (e) {
      setEsito({ testo: messaggio(e), errore: true });
      return false;
    }
  }

  async function abilita(ev: Event) {
    ev.preventDefault();
    setSalvando(true);
    const ok = await salva({ ...nuova, attivo: true }, `${nuova.nome.trim()} abilitato.`);
    setSalvando(false);
    if (ok) setNuova({ codice: '', nome: '', email: '', ruolo: '' });
  }

  return (
    <section class="scheda" aria-label="Persone">
      <h1>Persone</h1>
      <ul class="persone">
        {persone.map((p) => (
          <li key={p.uid} class={p.attivo ? '' : 'disattivo'}>
            <div class="nome"><strong>{p.nome || '(senza nome)'}</strong>{p.uid === titolareUid && <span class="tu"> · tu</span>}</div>
            {p.email && <small>{p.email}</small>}
            {p.uid === titolareUid ? <small>{NOME_RUOLO[p.ruolo]}</small> : (
              <div class="comandi">
                <SceltaRuolo valore={p.ruolo} etichetta={`Ruolo di ${p.nome}`}
                  onChange={(r) => void salva({ ...p, codice: p.uid, ruolo: r }, `${p.nome}: ruolo ${NOME_RUOLO[r as Ruolo]}.`)} />
                <button type="button" class="secondario piccolo"
                  onClick={() => void salva({ ...p, codice: p.uid, attivo: !p.attivo }, `${p.nome} ${p.attivo ? 'disattivato' : 'riattivato'}.`)}>
                  {p.attivo ? 'Disattiva' : 'Riattiva'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p role="status" class={esito?.errore ? 'esito errore' : 'esito'}>{esito?.testo ?? ''}</p>
      <form class="nuova" onSubmit={abilita}>
        <h2>Abilita una persona</h2>
        <input aria-label="Codice utente" placeholder="Codice utente" autocomplete="off" required value={nuova.codice}
          onInput={(e) => setNuova({ ...nuova, codice: e.currentTarget.value })} />
        <input aria-label="Nome" placeholder="Nome" required value={nuova.nome}
          onInput={(e) => setNuova({ ...nuova, nome: e.currentTarget.value })} />
        <input aria-label="Email" placeholder="Email (facoltativa)" type="email" value={nuova.email}
          onInput={(e) => setNuova({ ...nuova, email: e.currentTarget.value })} />
        <SceltaRuolo valore={nuova.ruolo} etichetta="Ruolo della persona nuova" onChange={(r) => setNuova({ ...nuova, ruolo: r })} />
        <button type="submit" class="primario" disabled={salvando}>Abilita</button>
      </form>
    </section>
  );
}
