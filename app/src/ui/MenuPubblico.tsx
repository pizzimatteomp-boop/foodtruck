/** Menu pubblico (QR code): aperto a tutti, senza accesso. Italiano e inglese. */
import type { Firestore } from 'firebase/firestore';
import { nomeAllergene, type Lingua } from '../etichette/allergeni';
import { perGruppo } from '../menu/menu';
import { useMenuPubblicato } from '../menu/menu.db';
import { euro } from './formato';
import { LogoV } from './LogoV';
import { Segmenti } from './Segmenti';

const T = {
  it: { titolo: 'Menu', ingredienti: 'Ingredienti', contiene: 'Contiene', puo: 'Può contenere', nessuno: 'nessun allergene', vuoto: 'Il menu non è ancora disponibile.',
    errore: 'Menu non raggiungibile: controlla la connessione.', nota: 'Gli allergeni sono evidenziati in grassetto. Per qualsiasi dubbio chiedi al personale.', aggiornato: 'Aggiornato il' },
  en: { titolo: 'Menu', ingredienti: 'Ingredients', contiene: 'Contains', puo: 'May contain', nessuno: 'no allergens', vuoto: 'The menu is not available yet.',
    errore: 'Menu not reachable: check your connection.', nota: 'Allergens are shown in bold. If in doubt, please ask our staff.', aggiornato: 'Updated on' },
};

export function linguaDa(hash: string, preferita: string): Lingua {
  const q = /[?&]lang=(it|en)\b/.exec(hash)?.[1];
  if (q === 'it' || q === 'en') return q;
  return preferita.toLowerCase().startsWith('it') ? 'it' : 'en';
}

export function MenuPubblico({ db, hash }: { db: Firestore; hash: string }) {
  const { menu, caricato, errore } = useMenuPubblicato(db);
  const lingua = linguaDa(hash, navigator.language || 'it');
  const t = T[lingua];
  const data = menu?.aggiornatoIl?.toDate();
  return (
    <div class="menu-pubblico" lang={lingua}>
      <header class="menu-testata">
        <span class="marchio"><LogoV />VEGMAN</span>
        <nav class="lingue" aria-label="Lingua / Language">
          <a href="#/menu?lang=it" aria-current={lingua === 'it' ? 'true' : undefined}>IT</a>
          <a href="#/menu?lang=en" aria-current={lingua === 'en' ? 'true' : undefined}>EN</a>
        </nav>
      </header>
      <main class="menu-corpo">
        <h1>{t.titolo}</h1>
        {!caricato && <p>…</p>}
        {caricato && errore && <p class="errore">{t.errore}</p>}
        {caricato && !errore && (!menu || menu.voci.length === 0) && <p>{t.vuoto}</p>}
        {menu && perGruppo(menu.voci).map((g) => (
          <section key={g.gruppo} aria-label={g.gruppo || t.titolo}>
            {g.gruppo && <h2>{g.gruppo}</h2>}
            {g.voci.map((v) => (
              <article key={v.id} class="voce-menu" aria-label={v.nome[lingua]}>
                <div class="voce-testa"><h3>{v.nome[lingua]}</h3><span class="prezzo">{euro(v.prezzo)}</span></div>
                <p><span class="etichetta-campo">{t.ingredienti}:</span> <Segmenti s={v.lista[lingua]} />.</p>
                <p class="allergeni-voce"><span class="etichetta-campo">{t.contiene}:</span> {v.allergeni.length ? v.allergeni.map((a) => nomeAllergene(a, lingua)).join(', ') : t.nessuno}.
                  {v.tracce.length > 0 && <> <span class="etichetta-campo">{t.puo}:</span> {v.tracce.map((a) => nomeAllergene(a, lingua)).join(', ')}.</>}</p>
              </article>
            ))}
          </section>
        ))}
        <p class="nota">{t.nota}</p>
        {data && <p class="nota">{t.aggiornato} {data.toLocaleDateString(lingua === 'it' ? 'it-IT' : 'en-GB')}</p>}
      </main>
    </div>
  );
}
