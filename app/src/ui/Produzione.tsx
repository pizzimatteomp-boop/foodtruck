/**
 * Pagina «Produzione» (laboratorio, dal telefono): tocchi il prodotto, scrivi quanto ne hai fatto e quante
 * etichette, «Registra e stampa». Le etichette escono dal computer della stampante («Stazione etichette»).
 */
import type { Firestore } from 'firebase/firestore';
import { useMemo, useState } from 'preact/hooks';
import { useRaccolta } from '../dati/useRaccolta.db';
import { listaIngredienti } from '../etichette/lista';
import type { Ingrediente, Prodotto } from '../foodcost/modello';
import { contenutoEtichetta, ErroreProduzione, leggiMisura, preparaProduzione, quantitaLeggibile } from '../produzione/produzione';
import { registraProduzione, ristampa, useEtichette, type Etichetta } from '../produzione/produzione.db';
import { EtichettaVista } from './EtichettaVista';
import { oggi } from '../dati/oggi';
import { daProdurre } from '../eventi/carico';
import { useCarichi } from '../eventi/carico.db';
import { MISURA_CHIAVE } from './Stazione';

const STATO: Record<Etichetta['stato'], string> = { da_stampare: '⏳ in coda', in_stampa: '🖨 in stampa', stampata: '✅ stampata' };

export function Produzione({ db, uid }: { db: Firestore; uid: string }) {
  const pro = useRaccolta<Prodotto>(db, 'prodotti');
  const ing = useRaccolta<Ingrediente>(db, 'ingredienti');
  const et = useEtichette(db, 20);
  const car = useCarichi(db);
  const prod = useRaccolta<{ id: string; prodotto: string; quantita: number; creatoIl?: { toMillis?: () => number } }>(db, 'produzioni');
  // Lista di produzione (P4): semilavorati che mancano nei piani di carico dei prossimi eventi.
  const lista = useMemo(() => daProdurre(
    car.dati.map((c) => ({ evento: c.evento, dal: c.dal, al: c.al, preparatoMs: (c.preparato as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0, righe: c.righe })),
    prod.dati.map((x) => ({ prodotto: x.prodotto, quantita: x.quantita, ms: x.creatoIl?.toMillis?.() ?? Date.now() })),
    oggi(),
  ), [car.dati, prod.dati]);
  const [cerca, setCerca] = useState('');
  const [scelto, setScelto] = useState<Prodotto | null>(null);
  const [campi, setCampi] = useState({ quantita: '', copie: '1', nota: '' });
  const [esito, setEsito] = useState<{ testo: string; errore: boolean } | null>(null);
  const [invio, setInvio] = useState(false);
  const misura = leggiMisura((() => { try { return localStorage.getItem(MISURA_CHIAVE); } catch { return null; } })());

  // Solo i semilavorati: si fanno in laboratorio (i prodotti finiti si assemblano all'evento). Deciso da Matteo il 12/11/2026.
  const elenco = useMemo(() => pro.dati.filter((p) => p.tipo === 'semilavorato').sort((a, b) => a.nome.localeCompare(b.nome, 'it')), [pro.dati]);
  const visibili = elenco.filter((p) => !cerca.trim() || p.nome.toLowerCase().includes(cerca.trim().toLowerCase()));
  const mappe = useMemo(() => ({ prodotti: new Map(pro.dati.map((p) => [p.id, p] as const)), ingredienti: new Map(ing.dati.map((i) => [i.id, i] as const)) }), [pro.dati, ing.dati]);

  const anteprima = useMemo(() => {
    if (!scelto) return null;
    try {
      const p = preparaProduzione(scelto, { ...campi, copie: campi.copie || '0', quantita: campi.quantita || String(scelto.resa.quantita || 1) }, new Date());
      const lista = listaIngredienti(scelto.id, mappe);
      return { p, c: contenutoEtichetta(p, lista, new Date()), problemi: lista.problemi.it };
    } catch { return null; }
  }, [scelto, campi, mappe]);

  function scegli(p: Prodotto, quantita?: number) {
    setScelto(p);
    setCampi({ quantita: String(quantita ?? (p.resa.quantita || '')).replace('.', ','), copie: '1', nota: '' });
    setEsito(null);
  }

  async function registra(e: Event) {
    e.preventDefault();
    if (!scelto || invio) return;
    setInvio(true);
    try {
      const quando = new Date();
      const p = preparaProduzione(scelto, campi, quando);
      const c = contenutoEtichetta(p, listaIngredienti(scelto.id, mappe), quando);
      await registraProduzione(db, uid, p, c);
      setEsito({ testo: `✅ ${p.nome} · ${quantitaLeggibile(p.quantita, p.unita)} · lotto ${p.lotto}${p.copie ? ` · ${p.copie} ${p.copie === 1 ? 'etichetta' : 'etichette'} alla stampante` : ''}`, errore: false });
      setScelto(null);
    } catch (err) {
      setEsito({ testo: err instanceof ErroreProduzione ? err.message : 'Non registrata: riprova.', errore: true });
    }
    setInvio(false);
  }

  if (!pro.caricato) return <section class="scheda"><p>Carico…</p></section>;
  return (
    <section class="scheda" aria-label="Produzione">
      <h1>Produzione</h1>
      {esito && <p class={esito.errore ? 'esito errore' : 'esito'} role={esito.errore ? 'alert' : 'status'}>{esito.testo}</p>}
      {scelto ? (
        <form class="nuova" aria-label="Nuova produzione" onSubmit={(e) => void registra(e)}>
          <h2>{scelto.nome}</h2>
          <div class="due">
            <label class="campo"><span>Quantità prodotta ({scelto.resa.unita || 'pz'})</span>
              <input inputMode="decimal" value={campi.quantita} onInput={(e) => setCampi({ ...campi, quantita: e.currentTarget.value })} /></label>
            <label class="campo"><span>Etichette</span>
              <input type="number" inputMode="numeric" min={0} max={50} value={campi.copie} onInput={(e) => setCampi({ ...campi, copie: e.currentTarget.value })} /></label>
          </div>
          <input aria-label="Nota" placeholder="Nota (facoltativa, va sull'etichetta)" maxLength={200} value={campi.nota} onInput={(e) => setCampi({ ...campi, nota: e.currentTarget.value })} />
          {anteprima && (
            <div class="anteprima-etichetta" aria-label="Anteprima etichetta">
              <EtichettaVista c={anteprima.c} misura={misura} scala={Math.min(1, 270 / (misura.larghezza * 3.78))} />
            </div>
          )}
          {anteprima?.problemi.length ? <p class="nota">Dati dell'etichetta da completare: {anteprima.problemi.join('; ')}.</p> : null}
          <div class="comandi">
            <button type="submit" class="primario" disabled={invio}>Registra e stampa</button>
            <button type="button" class="secondario" onClick={() => setScelto(null)}>Indietro</button>
          </div>
        </form>
      ) : (
        <>
          {lista.length > 0 && (<>
            <h2>Da produrre per i prossimi eventi</h2>
            <ul class="persone" aria-label="Da produrre">
              {lista.map((x) => {
                const p = elenco.find((y) => y.id === x.id);
                return (
                  <li key={`${x.id}-${x.evento}`}>
                    <div class="nome"><strong>{x.nome} · {quantitaLeggibile(x.resta, x.unita)}</strong> <small>per {x.evento} ({x.dal.split('-').reverse().slice(0, 2).join('/')}){x.fatto ? ` · già fatti ${quantitaLeggibile(x.fatto, x.unita)}` : ''}</small></div>
                    {p && <div class="comandi"><button type="button" class="primario piccolo" aria-label={`Produci ${x.nome}`} onClick={() => scegli(p, Math.ceil(x.resta))}>Produci</button></div>}
                  </li>
                );
              })}
            </ul>
            <h2>Tutti i semilavorati</h2>
          </>)}
          <input aria-label="Cerca prodotto" placeholder="🔍 Cerca" value={cerca} onInput={(e) => setCerca(e.currentTarget.value)} />
          <div class="griglia-prodotti produzione-griglia">
            {visibili.map((p) => (
              <button key={p.id} type="button" class="semilavorato" onClick={() => scegli(p)}>
                <span>{p.nome}</span><small>{p.resa.quantita ? `ricetta: ${quantitaLeggibile(p.resa.quantita, p.resa.unita)}` : 'semilavorato'}</small>
              </button>
            ))}
          </div>
          {!visibili.length && <p class="nota">Nessun semilavorato{cerca.trim() ? ' con questo nome' : ': si creano nella pagina Prodotti (tipo «semilavorato»)'}.</p>}
        </>
      )}
      <h2>Ultime etichette</h2>
      <ul class="persone" aria-label="Ultime etichette">
        {et.dati.map((x) => (
          <li key={x.id}>
            <div class="nome"><strong>{x.contenuto.prodotto}</strong> <small>{x.contenuto.data} · lotto {x.contenuto.lotto} · {x.copie} pz · {STATO[x.stato]}</small></div>
            <div class="comandi"><button type="button" class="secondario piccolo" onClick={() => void ristampa(db, uid, x, 1).then(() => setEsito({ testo: `Ristampa di ${x.contenuto.prodotto} in coda.`, errore: false }))}>Ristampa 1</button></div>
          </li>
        ))}
      </ul>
      {et.caricato && !et.dati.length && <p class="nota">Ancora nessuna etichetta.</p>}
    </section>
  );
}
