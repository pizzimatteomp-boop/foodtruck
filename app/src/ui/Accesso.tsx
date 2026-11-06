/** Schermata prima dell'ingresso: caricamento, pulsante Google, attesa di abilitazione. */
import { useState } from 'preact/hooks';
import { accediConGoogle, esci, type Servizi } from '../firebase/accesso';
import type { Ambiente } from '../firebase/config';
import { messaggioErrore, vista, type StatoSchermata } from './schermata';

export function Accesso({ stato, servizi, ambiente, onErrore }: {
  stato: Exclude<StatoSchermata, { stato: 'dentro' }>;
  servizi: Servizi;
  ambiente: Ambiente;
  onErrore: (messaggio: string) => void;
}) {
  const [inCorso, setInCorso] = useState(false);
  const [copiato, setCopiato] = useState(false);
  const v = vista(stato);

  const accedi = async () => {
    setInCorso(true);
    try {
      await accediConGoogle(servizi);
    } catch (e) {
      onErrore(messaggioErrore((e as { code?: string }).code ?? ''));
    } finally {
      setInCorso(false);
    }
  };
  const copia = async () => {
    if (stato.stato !== 'non-abilitato') return;
    await navigator.clipboard.writeText(stato.uid);
    setCopiato(true);
  };

  return (
    <div class="centro">
      <main class="scheda">
        <h1>{v.titolo}</h1>
        {v.righe.map((r) => <p key={r}>{r}</p>)}
        {v.codice && <code class="codice">{v.codice}</code>}
        {v.errore && <p class="errore">{v.errore}</p>}
        {v.azioni.includes('accedi') && <button type="button" class="primario" disabled={inCorso} onClick={accedi}>Accedi con Google</button>}
        {v.azioni.includes('copia-codice') && <button type="button" class="secondario" onClick={copia}>{copiato ? 'Copiato ✓' : 'Copia il codice'}</button>}
        {v.azioni.includes('esci') && <button type="button" class="secondario" onClick={() => void esci(servizi)}>Esci</button>}
        {ambiente === 'prova' && <p class="ambiente">Ambiente di PROVA · dati non reali</p>}
      </main>
    </div>
  );
}
