/** Home: saluto e, per chi ne ha, il pannello con tutte le pagine. */
import { indirizzo, pagineVisibili } from '../app/navigazione';
import type { Ruolo } from '../firebase/ruoli';

const NOME_RUOLO: Record<Ruolo, string> = { titolare: 'Titolare', cassa: 'Cassa', team: 'Team' };

export function Home({ nome, ruolo }: { nome: string; ruolo: Ruolo }) {
  const pagine = pagineVisibili(ruolo).filter((p) => p.id !== 'home');
  return (
    <section class="scheda">
      <h1>Ciao {nome}</h1>
      <p>Ruolo: {NOME_RUOLO[ruolo]}</p>
      {pagine.length === 0 ? <p>Le prossime funzioni arriveranno qui.</p> : (
        <nav class="pannello-pagine" aria-label="Pagine">
          {pagine.map((p) => (
            <a key={p.id} href={indirizzo(p)}>
              <span class="icona" aria-hidden="true">{p.icona}</span>
              <span><strong>{p.titolo}</strong><small>{p.descrizione}</small></span>
            </a>
          ))}
        </nav>
      )}
    </section>
  );
}
