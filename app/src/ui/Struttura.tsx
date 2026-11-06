/** Intestazione, menu delle pagine (in basso sul telefono, a lato sullo schermo grande) e contenuto. */
import type { ComponentChildren } from 'preact';
import { indirizzo, pagineVisibili, type Pagina } from '../app/navigazione';
import { esci, type Servizi } from '../firebase/accesso';
import type { Ambiente } from '../firebase/config';
import type { Profilo } from '../firebase/profilo';
import { LogoV } from './LogoV';

export function Struttura({ servizi, ambiente, profilo, pagina, children }: {
  servizi: Servizi;
  ambiente: Ambiente;
  profilo: Profilo;
  pagina: Pagina;
  children: ComponentChildren;
}) {
  const pagine = pagineVisibili(profilo.ruolo);
  return (
    <div class="struttura">
      <header class="testata">
        <a class="marchio" href="#/" aria-label="VegMan, Home"><LogoV />VEGMAN</a>
        {ambiente === 'prova' && <span class="badge-prova" title="Ambiente di PROVA · dati non reali">PROVA</span>}
        <button type="button" class="secondario piccolo" onClick={() => void esci(servizi)}>Esci</button>
      </header>
      {pagine.length > 1 && (
        <nav class="menu" aria-label="Menu">
          {pagine.map((p) => (
            <a key={p.id} href={indirizzo(p)} aria-current={p.id === pagina.id ? 'page' : undefined}>
              <span aria-hidden="true">{p.icona}</span> {p.titolo}
            </a>
          ))}
        </nav>
      )}
      <main class="contenuto">{children}</main>
    </div>
  );
}
