/**
 * Impostazioni di QUESTO telefono, in «Apri la cassa» dentro un riquadro chiuso: stampante, chiave SumUp
 * e credenziali Fisconline (solo app Android, solo titolare). Le credenziali si salvano e si cancellano,
 * non si mostrano mai; salvarle di nuovo toglie il blocco dopo un accesso rifiutato.
 */
import { Capacitor } from '@capacitor/core';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ErroreCredenziali } from '../fiscal/cassaforte';
import { accessoBloccato, deposito, sbloccaAccesso } from './portaleTelefono';
import { chiaveSumUp, salvaChiaveSumUp } from './sumupTelefono';

const NATIVA = Capacitor.isNativePlatform();
type Esito = { testo: string; errore: boolean } | null;

export function ImpostazioniTelefono({ titolare, aperta = false, children }: { titolare: boolean; aperta?: boolean; children?: ComponentChildren }) {
  return (
    <details class="impostazioni" open={aperta || undefined}>
      <summary>⚙ Impostazioni di questo telefono</summary>
      <div class="nuova">
        {children}
        {titolare && NATIVA && <ChiaveSumUp />}
        {titolare && NATIVA && <Credenziali />}
      </div>
    </details>
  );
}

/** Chiave SumUp («affiliate key» legata a it.vegman.app): con la chiave, ELET in cassa apre l'app SumUp. */
function ChiaveSumUp() {
  const [chiave, setChiave] = useState<string | null | undefined>(undefined);
  const [nuova, setNuova] = useState('');
  useEffect(() => { void chiaveSumUp().then(setChiave); }, []);
  if (chiave === undefined) return null;
  return (
    <div aria-label="SumUp" role="group">
      <h3>Carta (SumUp)</h3>
      {chiave ? (
        <div class="comandi">
          <p>✅ Chiave impostata: ELET apre SumUp</p>
          <button type="button" class="secondario pericolo piccolo" onClick={() => void salvaChiaveSumUp(null).then(() => setChiave(null))}>Togli</button>
        </div>
      ) : (
        <div class="nuova">
          <input aria-label="Chiave SumUp" placeholder="Affiliate key SumUp" autocomplete="off" spellcheck={false} value={nuova} onInput={(e) => setNuova(e.currentTarget.value)} />
          <button type="button" class="primario" disabled={!nuova.trim()} onClick={() => void salvaChiaveSumUp(nuova).then(() => { setChiave(nuova.trim()); setNuova(''); })}>Salva chiave</button>
        </div>
      )}
    </div>
  );
}

function Credenziali() {
  const [presenti, setPresenti] = useState<boolean | null>(null);
  const [bloccato, setBloccato] = useState(false);
  const [modulo, setModulo] = useState({ codiceFiscale: '', password: '', pin: '' });
  const [esito, setEsito] = useState<Esito>(null);
  useEffect(() => {
    void deposito().then((c) => c.presenti()).then(setPresenti).catch(() => setPresenti(false));
    void accessoBloccato().then(setBloccato);
  }, []);

  async function salva(ev: Event) {
    ev.preventDefault();
    try {
      await (await deposito()).salva(modulo);
      await sbloccaAccesso();
      setModulo({ codiceFiscale: '', password: '', pin: '' });
      setPresenti(true);
      setBloccato(false);
      setEsito({ testo: 'Salvate e cifrate nel telefono.', errore: false });
    } catch (e) {
      setEsito({ testo: e instanceof ErroreCredenziali ? e.message : 'Salvataggio non riuscito.', errore: true });
    }
  }
  async function cancella() {
    if (!confirm('Cancellare le credenziali Fisconline da questo telefono?')) return;
    await (await deposito()).cancella();
    setPresenti(false);
    setEsito({ testo: 'Cancellate.', errore: false });
  }

  return (
    <div aria-label="Credenziali Fisconline" role="group">
      <h3>Agenzia delle Entrate (Fisconline)</h3>
      {presenti === null ? <p class="nota">Controllo…</p> : presenti && !bloccato ? (
        <div class="comandi">
          <p>✅ Credenziali salvate su questo telefono</p>
          <button type="button" class="secondario pericolo piccolo" onClick={() => void cancella()}>Cancella</button>
        </div>
      ) : (
        <form class="nuova" onSubmit={salva} autocomplete="off">
          {bloccato
            ? <p class="errore" role="alert">L'ultimo accesso è stato rifiutato e l'app non riprova da sola. Controlla le credenziali entrando nel portale dal computer, poi salvale di nuovo qui.</p>
            : <p class="nota">Restano solo su questo telefono, cifrate. Non vanno nel database né su internet.</p>}
          <input aria-label="Codice fiscale" placeholder="Codice fiscale" autocomplete="off" autocapitalize="characters" spellcheck={false}
            value={modulo.codiceFiscale} onInput={(e) => setModulo({ ...modulo, codiceFiscale: e.currentTarget.value })} />
          <input aria-label="Password Fisconline" placeholder="Password" type="password" autocomplete="off"
            value={modulo.password} onInput={(e) => setModulo({ ...modulo, password: e.currentTarget.value })} />
          <input aria-label="PIN Fisconline" placeholder="PIN completo (10 cifre)" type="password" inputMode="numeric" autocomplete="off"
            value={modulo.pin} onInput={(e) => setModulo({ ...modulo, pin: e.currentTarget.value })} />
          <button type="submit" class="primario">Salva nel telefono</button>
        </form>
      )}
      {esito && <p role="status" class={esito.errore ? 'esito errore' : 'esito'}>{esito.testo}</p>}
    </div>
  );
}
