/**
 * Pagina «Magazzino» (titolare): da ricomprare / da produrre (scorte minime), confronto dell'ultimo
 * inventario con l'atteso, stock teorico di ogni voce e impostazione delle scorte minime.
 */
import type { Firestore } from 'firebase/firestore';
import { useState } from 'preact/hooks';
import { NOMI_SEZIONE, type VoceMagazzino } from '../magazzino/inventario';
import { salvaScorte } from '../magazzino/inventario.db';
import { cambiaScorta, ErroreScorta, inConfezioni, preparaScorta, testoScorta, type Scorte } from '../magazzino/scorte';
import { quantitaLeggibile } from '../produzione/produzione';
import { euro } from './formato';
import { useStockMagazzino } from './stockMagazzino';

const segno = (n: number, unita: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${quantitaLeggibile(Math.abs(n), unita)}`;

export function Magazzino({ db }: { db: Firestore }) {
  const calcolo = useStockMagazzino(db);
  if (!calcolo) return <section class="scheda"><p>Carico…</p></section>;
  const { voci, stock, ultimo, diff, prezzo, prova, scorte, sotto } = calcolo;
  const perChiave = new Map(voci.map((v) => [v.chiave, v] as const));
  const contate = stock.filter((s) => s.teorico !== null);
  const valoreDiff = diff.reduce((t, d) => t + d.differenza * (prezzo(d.chiave) ?? 0), 0);
  return (
    <section class="scheda" aria-label="Magazzino">
      <h1>Magazzino</h1>
      {prova && <p class="simulatore" role="note">Le vendite usate sono scontrini di <strong>prova</strong> (simulatore).</p>}
      {sotto.length > 0 && (<>
        <h2>Sotto la scorta minima</h2>
        <ul class="elenco" aria-label="Sotto scorta">{sotto.map((x) => <li key={x.chiave}><span class="nome">{x.azione === 'da produrre' ? '🏭' : '🛒'} {x.testo}</span></li>)}</ul>
      </>)}
      {ultimo ? (<>
        <h2>Ultimo inventario · {ultimo.giorno.split('-').reverse().join('/')}</h2>
        {diff.length ? (<>
          <p class="nota">Contato contro atteso (dall'inventario precedente + fatture + produzione − vendite − senza incasso). Valore delle differenze ai prezzi di oggi: <strong>{euro(valoreDiff)}</strong>.</p>
          <table class="tabella" aria-label="Differenze dell'inventario">
            <thead><tr><th>Voce</th><th>Atteso</th><th>Contato</th><th>Diff.</th></tr></thead>
            <tbody>{diff.map((d) => (
              <tr key={d.chiave} class={d.percentuale !== null && Math.abs(d.percentuale) >= 10 ? 'fuori-soglia' : ''}>
                <th scope="row">{d.nome}</th><td>{quantitaLeggibile(d.atteso, d.unita)}</td><td>{quantitaLeggibile(d.contato, d.unita)}</td>
                <td>{segno(d.differenza, d.unita)}{d.percentuale !== null ? ` (${d.percentuale.toString().replace('.', ',')}%)` : ''}</td>
              </tr>
            ))}</tbody>
          </table>
        </>) : <p class="nota">Per il confronto serve un inventario precedente delle stesse voci: dal prossimo inventario vedrai le differenze.</p>}
      </>) : <p class="nota">Ancora nessun inventario: fai il primo dalla pagina «Inventario», sarà il punto di partenza.</p>}

      <h2>Stock oggi (teorico)</h2>
      <table class="tabella" aria-label="Stock teorico">
        <thead><tr><th>Voce</th><th>Contato</th><th>Movimenti</th><th>Oggi</th></tr></thead>
        <tbody>{contate.map((s) => {
          const v = perChiave.get(s.chiave)!;
          return (
            <tr key={s.chiave}>
              <th scope="row">{v.nome}<br /><small>{NOMI_SEZIONE[v.sezione]} · {s.base!.giorno.split('-').reverse().slice(0, 2).join('/')}{scorte[v.chiave] ? ` · min ${inConfezioni(scorte[v.chiave]!, v)}` : ''}</small></th>
              <td>{quantitaLeggibile(s.base!.quantita, v.unita)}</td>
              <td>{s.entrate ? `+${quantitaLeggibile(s.entrate, v.unita)}` : ''}{s.entrate && s.uscite ? ' ' : ''}{s.uscite ? `−${quantitaLeggibile(s.uscite, v.unita)}` : ''}{!s.entrate && !s.uscite ? '—' : ''}</td>
              <td class={s.teorico! < 0 ? 'negativo' : ''}><strong>{quantitaLeggibile(s.teorico!, v.unita)}</strong></td>
            </tr>
          );
        })}</tbody>
      </table>
      {stock.some((s) => s.teorico !== null && s.teorico < 0) && <p class="errore" role="note">Stock negativo: manca una fattura o una produzione registrata, oppure la ricetta non corrisponde.</p>}
      <p class="nota">{stock.length - contate.length} voci mai contate: entrano nello stock dal primo inventario. Le fatture con la stessa data dell'inventario, se l'inventario è del pomeriggio, si considerano già contate.</p>
      <ScorteMinime db={db} voci={voci} scorte={scorte} />
    </section>
  );
}

/** Scorte minime: per ogni voce un numero, in confezioni se la voce ne ha una. Si salva uscendo dal campo. */
function ScorteMinime({ db, voci, scorte }: { db: Firestore; voci: readonly VoceMagazzino[]; scorte: Scorte }) {
  const [cerca, setCerca] = useState('');
  const [esito, setEsito] = useState<{ testo: string; errore: boolean } | null>(null);
  const impostate = Object.keys(scorte).length;
  const elenco = voci.filter((v) => !cerca.trim() || v.nome.toLowerCase().includes(cerca.trim().toLowerCase()));
  async function salva(v: VoceMagazzino, testo: string) {
    try {
      const minimo = preparaScorta(testo, v);
      if ((minimo ?? undefined) === scorte[v.chiave]) return;
      await salvaScorte(db, cambiaScorta(scorte, v.chiave, minimo));
      setEsito({ testo: minimo ? `✅ ${v.nome}: minimo ${inConfezioni(minimo, v)}` : `✅ ${v.nome}: nessuna scorta minima`, errore: false });
    } catch (e) {
      setEsito({ testo: e instanceof ErroreScorta ? e.message : 'Non salvata: riprova.', errore: true });
    }
  }
  return (
    <details class="scontrini-oggi">
      <summary>Scorte minime · {impostate} impostate</summary>
      <p class="nota">Sotto la scorta minima la voce compare qui sopra e negli Avvisi: da ricomprare (ingredienti, packaging) o da produrre (semilavorati). Si scrive in confezioni se la voce ne ha una; vuoto = nessuna soglia. Vale per le voci già contate almeno una volta.</p>
      <input aria-label="Cerca nelle scorte" placeholder="🔍 Cerca" value={cerca} onInput={(e) => setCerca(e.currentTarget.value)} />
      {esito && <p class={esito.errore ? 'esito errore' : 'esito'} role={esito.errore ? 'alert' : 'status'}>{esito.testo}</p>}
      <ul class="persone scorte" aria-label="Scorte minime">
        {elenco.map((v) => (
          <li key={v.chiave}>
            <div class="nome"><strong>{v.nome}</strong> <small>{NOMI_SEZIONE[v.sezione]}</small></div>
            <label class="scorta"><input aria-label={`Scorta minima di ${v.nome}`} inputMode="decimal" placeholder="—" defaultValue={testoScorta(scorte[v.chiave], v)}
              onChange={(e) => void salva(v, e.currentTarget.value)} /> <small>{v.conta ? v.conta.nome : v.unita}</small></label>
          </li>
        ))}
      </ul>
    </details>
  );
}
