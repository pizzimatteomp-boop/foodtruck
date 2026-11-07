/** Pagina «Menu e QR» (titolare): anteprima, controlli, pubblicazione, QR code, stampa. */
import type { Firestore } from 'firebase/firestore';
import { useMemo, useState } from 'preact/hooks';
import { useRaccolta } from '../dati/useRaccolta.db';
import { ALLERGENI, nomeAllergene } from '../etichette/allergeni';
import type { Ingrediente, Prodotto } from '../foodcost/modello';
import { costruisciMenu, stessoMenu, type VoceMenu } from '../menu/menu';
import { pubblicaMenu, useMenuPubblicato } from '../menu/menu.db';
import { svgQr } from '../menu/qr';
import { euro } from './formato';
import { LogoV } from './LogoV';
import { Segmenti } from './Segmenti';

export const indirizzoMenu = () => `${location.origin}/#/menu`;

function Qr({ dimensione }: { dimensione: string }) {
  const svg = useMemo(() => svgQr(indirizzoMenu(), 'QR code del menu'), []);
  return <span class="qr" style={{ width: dimensione }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

function scaricaQr() {
  const url = URL.createObjectURL(new Blob([svgQr(indirizzoMenu(), 'QR code del menu VegMan')], { type: 'image/svg+xml' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'qr-menu-vegman.svg' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Fogli da stampare: cartello con tabella allergeni e QR, poi le schede dei prodotti. */
function Stampa({ voci }: { voci: VoceMenu[] }) {
  return (
    <div class="stampa" aria-label="Versione da stampare">
      <div class="no-stampa riga-titolo">
        <a href="#/pubblica">← Menu e QR</a>
        <button type="button" class="primario piccolo" onClick={() => window.print()}>Stampa</button>
      </div>
      <section class="foglio">
        <div class="foglio-testa"><LogoV /><div><strong>VEGMAN</strong><span>Allergeni · Allergens</span></div></div>
        <table class="tabella matrice stampabile" aria-label="Cartello allergeni">
          <thead><tr><th>Prodotto / Product</th>{ALLERGENI.map((a) => <th key={a.id}><span>{a.breve.it}<br />{a.breve.en}</span></th>)}</tr></thead>
          <tbody>{voci.map((v) => (
            <tr key={v.id}><th scope="row">{v.nome.it}{v.nome.en !== v.nome.it && <small> / {v.nome.en}</small>}</th>
              {ALLERGENI.map((a) => <td key={a.id} aria-label={a.it}>{v.allergeni.includes(a.id) ? '●' : v.tracce.includes(a.id) ? '○' : ''}</td>)}</tr>
          ))}</tbody>
        </table>
        <p class="legenda">● contiene / contains · ○ può contenere tracce / may contain traces</p>
        <div class="foglio-qr"><Qr dimensione="4.2cm" />
          <p><strong>Ingredienti e allergeni di ogni prodotto</strong><br />Ingredients and allergens of every product<br /><small>{indirizzoMenu()}</small></p>
        </div>
        <p class="legenda">Per qualsiasi dubbio sugli allergeni chiedi al personale. · If in doubt about allergens, please ask our staff.</p>
      </section>
      <section class="foglio">
        {voci.map((v) => (
          <article key={v.id} class="scheda-stampa">
            <h3>{v.nome.it}{v.nome.en !== v.nome.it && <small> · {v.nome.en}</small>}</h3>
            <p><strong>Ingredienti:</strong> <Segmenti s={v.lista.it} />. <strong>Contiene:</strong> {v.allergeni.map((a) => nomeAllergene(a, 'it')).join(', ') || 'nessun allergene'}.
              {v.tracce.length > 0 && <> <strong>Può contenere:</strong> {v.tracce.map((a) => nomeAllergene(a, 'it')).join(', ')}.</>}</p>
            <p lang="en"><strong>Ingredients:</strong> <Segmenti s={v.lista.en} />. <strong>Contains:</strong> {v.allergeni.map((a) => nomeAllergene(a, 'en')).join(', ') || 'no allergens'}.
              {v.tracce.length > 0 && <> <strong>May contain:</strong> {v.tracce.map((a) => nomeAllergene(a, 'en')).join(', ')}.</>}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

export function GestioneMenu({ db, uid, parametro }: { db: Firestore; uid: string; parametro: string | null }) {
  const pro = useRaccolta<Prodotto>(db, 'prodotti');
  const ing = useRaccolta<Ingrediente>(db, 'ingredienti');
  const pub = useMenuPubblicato(db);
  const [stato, setStato] = useState<'pronto' | 'salvataggio' | 'fatto' | 'errore'>('pronto');
  const attuale = useMemo(() => costruisciMenu(pro.dati, ing.dati), [pro.dati, ing.dati]);

  if (!pro.caricato || !ing.caricato || !pub.caricato) return <section class="scheda"><p>Caricamento…</p></section>;
  if (parametro === 'stampa') {
    return pub.menu?.voci.length ? <Stampa voci={pub.menu.voci} />
      : <section class="scheda"><p>Pubblica prima il menu: la stampa usa il menu pubblicato, lo stesso del QR code.</p><a href="#/pubblica">← Menu e QR</a></section>;
  }
  const uguale = stessoMenu(pub.menu?.voci, attuale.voci);
  const data = pub.menu?.aggiornatoIl?.toDate();

  async function pubblica() {
    setStato('salvataggio');
    try { await pubblicaMenu(db, attuale.voci, uid); setStato('fatto'); } catch { setStato('errore'); }
  }

  return (
    <section class="scheda" aria-label="Menu e QR">
      <h1>Menu e QR code</h1>
      <p aria-label="Stato del menu">{!pub.menu ? 'Il menu non è ancora pubblicato.'
        : <>Pubblicato {data ? `il ${data.toLocaleDateString('it-IT')} alle ${data.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : ''}. {uguale
          ? <span class="stato-ok">È aggiornato.</span> : <strong class="oltre">Ci sono modifiche non ancora pubblicate.</strong>}</>}</p>

      <h2>Cosa vedranno i clienti <small>({attuale.voci.length} prodotti)</small></h2>
      {attuale.voci.length === 0 && <p class="nota">Nessun prodotto in menu: spunta «In menu» nella scheda dei prodotti.</p>}
      <ul class="elenco">{attuale.voci.map((v) => (
        <li key={v.id}><a href={`#/prodotti/${encodeURIComponent(v.id)}`}>
          <span class="nome">{v.nome.it}{v.nome.en !== v.nome.it && <small> · {v.nome.en}</small>}</span><span class="valore">{euro(v.prezzo)}</span>
          <small class="dettaglio">{v.allergeni.length ? `Contiene: ${v.allergeni.map((a) => nomeAllergene(a, 'it', true)).join(', ')}` : 'Nessun allergene'}</small>
          <small class="dettaglio"><Segmenti s={v.lista.it} /></small>
        </a></li>
      ))}</ul>

      {attuale.bloccanti.length > 0 && (
        <div aria-label="Da sistemare prima di pubblicare">
          <h2>Da sistemare prima di pubblicare</h2>
          <ul class="avvisi errore">{attuale.bloccanti.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
      {attuale.avvisi.length > 0 && (
        <details><summary>Traduzioni mancanti ({attuale.avvisi.length}): nel menu inglese resterà l'italiano</summary>
          <ul class="avvisi">{attuale.avvisi.map((x) => <li key={x}>{x}</li>)}</ul></details>
      )}
      <button type="button" class="primario" disabled={attuale.bloccanti.length > 0 || attuale.voci.length === 0 || stato === 'salvataggio' || uguale}
        onClick={() => void pubblica()}>{stato === 'salvataggio' ? 'Pubblicazione…' : uguale ? 'Menu già aggiornato' : 'Pubblica menu'}</button>
      {stato === 'fatto' && <p class="ok" role="status">Menu pubblicato.</p>}
      {stato === 'errore' && <p class="errore" role="status">Pubblicazione non riuscita: riprova.</p>}

      <h2>QR code</h2>
      <div class="foglio-qr">
        <Qr dimensione="160px" />
        <p>Porta al menu pubblico:<br /><a href="#/menu" target="_blank" rel="noopener">{indirizzoMenu()}</a></p>
      </div>
      <div class="comandi">
        <button type="button" class="secondario" onClick={scaricaQr}>Scarica il QR (SVG)</button>
        <a class="pulsante secondario" href="#/pubblica/stampa">Versione da stampare</a>
      </div>
    </section>
  );
}
