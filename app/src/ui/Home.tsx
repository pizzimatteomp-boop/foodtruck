/** Home del titolare: saluto e tutte le pagine, divise per argomento. Gli altri ruoli entrano direttamente nella loro pagina. */
import { GRUPPI, indirizzo, pagineVisibili } from '../app/navigazione';
import type { Ruolo } from '../firebase/ruoli';

export function Home({ nome, ruolo }: { nome: string; ruolo: Ruolo }) {
  const pagine = pagineVisibili(ruolo).filter((p) => p.id !== 'home');
  return (
    <section class="scheda">
      <h1>Ciao {nome}</h1>
      {GRUPPI.map((g) => {
        const qui = pagine.filter((p) => p.gruppo === g);
        return qui.length ? (
          <nav key={g} class="pannello-pagine" aria-label={g}>
            <h2>{g}</h2>
            {qui.map((p) => (
              <a key={p.id} href={indirizzo(p)}>
                <span class="icona" aria-hidden="true">{p.icona}</span>
                <span><strong>{p.titolo}</strong><small>{p.descrizione}</small></span>
              </a>
            ))}
          </nav>
        ) : null;
      })}
    </section>
  );
}
