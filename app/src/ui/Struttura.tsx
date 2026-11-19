/** Intestazione, menu delle pagine (in basso sul telefono, a lato sullo schermo grande) e contenuto. */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { GRUPPI, indirizzo, pagineMenu, type Pagina } from '../app/navigazione';
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
  const pagine = pagineMenu(profilo.ruolo);
  // Altezza del menu in basso (telefono, compresa la barra di Android): le barre fisse delle pagine
  // (es. «Fine inventario») si appoggiano sopra il menu invece di finirci sotto.
  const menu = useRef<HTMLElement>(null);
  const testata = useRef<HTMLElement>(null);
  useEffect(() => {
    const radice = document.documentElement;
    const misura = () => {
      const m = menu.current;
      // solo il menu in basso (telefono): quello laterale dello schermo grande non copre niente
      const st = m ? getComputedStyle(m) : null;
      const h = m && st && st.position === 'sticky' && st.flexDirection === 'row' ? m.getBoundingClientRect().height : 0;
      radice.style.setProperty('--altezza-menu', `${Math.ceil(h)}px`);
      // altezza della testata: il menu laterale si ferma subito sotto
      const t = testata.current;
      if (t) radice.style.setProperty('--altezza-testata', `${t.getBoundingClientRect().height}px`);
    };
    misura();
    const o = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(misura);
    if (o && menu.current) o.observe(menu.current, { box: 'border-box' });
    if (o && testata.current) o.observe(testata.current, { box: 'border-box' });
    window.addEventListener('resize', misura);
    return () => { o?.disconnect(); window.removeEventListener('resize', misura); radice.style.removeProperty('--altezza-menu'); radice.style.removeProperty('--altezza-testata'); };
  }, [pagine.length]);
  return (
    <div class={pagina.id === 'vendi' ? 'struttura in-cassa' : 'struttura'}>
      <header ref={testata} class="testata">
        <a class="marchio" href="#/" aria-label="VegMan, Home"><LogoV />VEGMAN</a>
        {ambiente === 'prova' && <span class="badge-prova" title="Ambiente di PROVA · dati non reali">PROVA</span>}
        <button type="button" class="secondario piccolo" onClick={() => void esci(servizi)}>Esci</button>
      </header>
      {pagine.length > 1 && (
        <nav ref={menu} class="menu" aria-label="Menu">
          {/* Come la Home: Home in cima, poi le pagine divise per argomento (i titoli si vedono solo sullo schermo grande). */}
          {[null, ...GRUPPI].map((g) => {
            const qui = pagine.filter((p) => (g === null ? p.id === 'home' : p.id !== 'home' && p.gruppo === g));
            if (!qui.length) return null;
            return [
              g && <span key={`g-${g}`} class="menu-gruppo" aria-hidden="true">{g}</span>,
              ...qui.map((p) => (
                <a key={p.id} href={indirizzo(p)} class={p.principale ? '' : 'secondaria'} aria-current={p.id === pagina.id ? 'page' : undefined}>
                  <span class="icona" aria-hidden="true">{p.icona}</span><span>{p.titolo}</span>
                </a>
              )),
            ];
          })}
        </nav>
      )}
      <main class={pagina.id === 'vendi' ? 'contenuto larga' : 'contenuto'}>{children}</main>
    </div>
  );
}
