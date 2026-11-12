/**
 * «Stazione etichette»: pagina aperta sul computer collegato alla GODEX. Quando dal telefono arriva
 * un'etichetta, la stampa da sola. Con Chrome avviato con --kiosk-printing la stampa parte senza finestre;
 * senza, compare la finestra di stampa (basta «Stampa»). La misura dell'etichetta si sceglie qui.
 */
import type { Firestore } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'preact/hooks';
import { leggiMisura, type ContenutoEtichetta } from '../produzione/produzione';
import { prendi, rimettiInCoda, segnaStampata, useCoda, useEtichette, type Etichetta } from '../produzione/produzione.db';
import { EtichettaVista } from './EtichettaVista';

export const MISURA_CHIAVE = 'vegman-misura-etichetta';
const NOME_CHIAVE = 'vegman-stazione';
const leggi = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const scrivi = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* solo comodità */ } };

const PROVA: ContenutoEtichetta = {
  prodotto: 'Prova stampa', data: new Date().toLocaleDateString('it-IT'), lotto: 'PRO-000000-0000', quantita: '1 pz',
  ingredienti: [{ testo: 'ceci, acqua, ', grassetto: false }, { testo: 'sesamo', grassetto: true }], contiene: 'sesamo', puoContenere: '',
};

export function Stazione({ db }: { db: Firestore }) {
  const coda = useCoda(db);
  const ultime = useEtichette(db, 15);
  const [misuraTesto, setMisuraTesto] = useState(leggi(MISURA_CHIAVE) ?? '100x50');
  const misura = leggiMisura(misuraTesto);
  const [nome, setNome] = useState(leggi(NOME_CHIAVE) ?? 'Computer etichette');
  const [attiva, setAttiva] = useState(true);
  const [inStampa, setInStampa] = useState<{ c: ContenutoEtichetta; copie: number } | null>(null);
  const [stato, setStato] = useState('In attesa di etichette dal telefono…');
  const lavoro = useRef(false);

  /** Mette le etichette nell'area di stampa e apre la stampa; aspetta che il disegno sia pronto. */
  async function stampaOra(c: ContenutoEtichetta, copie: number) {
    setInStampa({ c, copie });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.print();
    setInStampa(null);
  }

  useEffect(() => {
    const x = coda[0];
    if (!attiva || !x || lavoro.current) return;
    lavoro.current = true;
    void (async () => {
      try {
        if (await prendi(db, x.id, nome)) {
          setStato(`Stampo ${x.copie} × ${x.contenuto.prodotto}…`);
          await stampaOra(x.contenuto, x.copie);
          await segnaStampata(db, x.id);
          setStato(`✅ Stampate ${x.copie} × ${x.contenuto.prodotto} (${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}). In attesa…`);
        }
      } catch (e) {
        setStato(`Problema con la stampa: ${(e as Error)?.message ?? 'errore'}. L'etichetta resta da rifare.`);
      }
      lavoro.current = false;
    })();
  }, [coda, attiva]);

  return (
    <section class="scheda" aria-label="Stazione etichette">
      <h1>Stazione etichette</h1>
      <p class="esito" role="status">{attiva ? stato : 'In pausa: le etichette restano in coda.'}</p>
      <p class="nota">In coda: <strong>{coda.length}</strong>. Lascia questa pagina aperta sul computer collegato alla stampante.</p>
      <div class="due">
        <label class="campo"><span>Misura etichetta (mm)</span>
          <input aria-label="Misura etichetta" value={misuraTesto} onInput={(e) => { setMisuraTesto(e.currentTarget.value); scrivi(MISURA_CHIAVE, e.currentTarget.value); }} /></label>
        <label class="campo"><span>Nome di questo computer</span>
          <input value={nome} maxLength={40} onInput={(e) => { setNome(e.currentTarget.value); scrivi(NOME_CHIAVE, e.currentTarget.value); }} /></label>
      </div>
      <p class="nota">Misura in uso: {misura.larghezza} × {misura.altezza} mm (es. «100x50»).</p>
      <div class="comandi">
        <button type="button" class="secondario" onClick={() => void stampaOra(PROVA, 1)}>Prova stampa</button>
        <button type="button" class="secondario" onClick={() => setAttiva(!attiva)}>{attiva ? 'Pausa' : 'Riprendi'}</button>
      </div>
      <h2>Ultime</h2>
      <ul class="persone" aria-label="Ultime etichette della stazione">
        {ultime.dati.map((x: Etichetta) => (
          <li key={x.id}>
            <div class="nome"><strong>{x.contenuto.prodotto}</strong> <small>{x.contenuto.lotto} · {x.copie} pz · {x.stato === 'stampata' ? '✅ stampata' : x.stato === 'in_stampa' ? `🖨 in stampa (${x.stazione ?? ''})` : '⏳ in coda'}</small></div>
            {x.stato !== 'da_stampare' && <div class="comandi"><button type="button" class="secondario piccolo" onClick={() => void rimettiInCoda(db, x.id)}>Stampa di nuovo</button></div>}
          </li>
        ))}
      </ul>
      <style>{`@page { size: ${misura.larghezza}mm ${misura.altezza}mm; margin: 0; }`}</style>
      <div id="stampa-etichette" aria-hidden="true">
        {inStampa && Array.from({ length: inStampa.copie }, (_, i) => <EtichettaVista key={i} c={inStampa.c} misura={misura} />)}
      </div>
    </section>
  );
}
