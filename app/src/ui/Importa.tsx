/** Pagina «Importa» (solo titolare): anteprima del backup di VegMan Planner, food cost, poi import. */
import type { Firestore } from 'firebase/firestore';
import { useState } from 'preact/hooks';
import { foodCost } from '../foodcost/calcolo';
import { ErroreImport, leggiPlanner, type RisultatoImport } from '../importazione/planner';
import { salvaImportPlanner } from '../importazione/salva.db';
import { euro, percentuale } from './formato';

const oggi = () => new Date().toISOString().slice(0, 10);

export function Importa({ db, uid }: { db: Firestore; uid: string }) {
  const [dati, setDati] = useState<RisultatoImport | null>(null);
  const [errore, setErrore] = useState('');
  const [stato, setStato] = useState<'pronto' | 'salvataggio' | 'fatto'>('pronto');
  const [testo, setTesto] = useState('');

  function leggi(contenuto: string) {
    setStato('pronto');
    try {
      setDati(leggiPlanner(contenuto));
      setErrore('');
    } catch (e) {
      setDati(null);
      setErrore(e instanceof ErroreImport ? e.message : 'File non leggibile.');
    }
  }

  async function importa() {
    if (!dati) return;
    setStato('salvataggio');
    try {
      await salvaImportPlanner(db, dati, uid);
      setStato('fatto');
    } catch (e) {
      setStato('pronto');
      setErrore((e as { code?: string }).code === 'permission-denied' ? 'Operazione non permessa.' : 'Import non riuscito: riprova.');
    }
  }

  const fc = dati ? foodCost(dati, { finestraGiorni: 60, oggi: oggi() }) : null;
  const vendibili = dati?.prodotti.filter((p) => p.tipo === 'vendibile') ?? [];

  return (
    <section class="scheda" aria-label="Importa">
      <h1>Importa da VegMan Planner</h1>
      <p>In VegMan Planner apri <strong>Impostazioni → Esporta backup</strong> e carica qui il file scaricato. Prima di salvare vedi cosa entra.</p>
      <label class="campo">
        <span>File di backup (.json)</span>
        <input type="file" accept=".json,application/json"
          onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void f.text().then(leggi); }} />
      </label>
      <details>
        <summary>Oppure incolla il testo (cella A1 del foglio «Data»)</summary>
        <textarea aria-label="Testo del backup" rows={4} value={testo} onInput={(e) => setTesto(e.currentTarget.value)} />
        <button type="button" class="secondario" onClick={() => leggi(testo)}>Leggi il testo</button>
      </details>
      {errore && <p class="errore" role="alert">{errore}</p>}

      {dati && fc && (
        <>
          <h2>Cosa entra</h2>
          <table class="tabella" aria-label="Conteggi">
            <tbody>
              <tr><th scope="row">Ingredienti</th><td>{dati.ingredienti.length}</td></tr>
              <tr><th scope="row">Prodotti in vendita</th><td>{vendibili.length}</td></tr>
              <tr><th scope="row">Semilavorati</th><td>{dati.prodotti.length - vendibili.length}</td></tr>
              <tr><th scope="row">Articoli dei fornitori</th><td>{dati.articoli.length}</td></tr>
              <tr><th scope="row">Righe di fattura</th><td>{dati.acquisti.length}</td></tr>
            </tbody>
          </table>

          <h2>Food cost (prezzi degli ultimi 60 giorni)</h2>
          <div class="scorri">
            <table class="tabella" aria-label="Food cost">
              <thead><tr><th>Prodotto</th><th>Prezzo</th><th>Costo</th><th>%</th></tr></thead>
              <tbody>
                {vendibili.map((p) => {
                  const c = fc.prodotti.get(p.id)!;
                  return (
                    <tr key={p.id}>
                      <th scope="row">{p.nome}{!c.completo && <small class="incompleto"> incompleto: {c.mancanti.length === 1 ? 'manca 1 prezzo' : `mancano ${c.mancanti.length} prezzi`}</small>}</th>
                      <td>{euro(p.prezzo)}</td>
                      <td>{euro(c.costoUnitario)}</td>
                      <td>{c.percentuale ? percentuale(c.percentuale) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {dati.avvisi.length > 0 && (
            <>
              <h2>Da sistemare dopo</h2>
              <ul class="avvisi">{dati.avvisi.map((a) => <li key={a}>{a}</li>)}</ul>
            </>
          )}

          {stato === 'fatto'
            ? <p class="ok" role="status">Import completato.</p>
            : <button type="button" class="primario" disabled={stato === 'salvataggio'} onClick={() => void importa()}>
                {stato === 'salvataggio' ? 'Import in corso…' : 'Importa in VegMan'}
              </button>}
          <p class="nota">Rifare l'import aggiorna i dati già importati, senza doppioni.</p>
        </>
      )}
    </section>
  );
}
