/**
 * Pagina «Passaggio alla definitiva» (titolare): nella prova scarica il file con i dati utili, nella definitiva
 * lo carica. Vedi src/trasferimento/trasferimento.ts per cosa si copia e cosa no.
 */
import type { Firestore } from 'firebase/firestore';
import { useState } from 'preact/hooks';
import { oggi } from '../dati/oggi';
import type { Ambiente } from '../firebase/config';
import { leggiPacchetto, NOMI, preparaPacchetto, scritture, type Pacchetto } from '../trasferimento/trasferimento';
import { data, giaPresenti, leggiPerPassaggio, scriviPassaggio } from '../trasferimento/trasferimento.db';

const riepilogo = (p: Pacchetto) => Object.entries(p.raccolte).filter(([, d]) => d.length).map(([r, d]) => `${d.length} ${NOMI[r] ?? r}`).join(' · ');

export function Passaggio({ db, uid, ambiente }: { db: Firestore; uid: string; ambiente: Ambiente }) {
  const [esito, setEsito] = useState<{ testo: string; errore: boolean } | null>(null);
  const [occupato, setOccupato] = useState(false);
  const [pacchetto, setPacchetto] = useState<Pacchetto | null>(null);

  async function scarica() {
    setOccupato(true); setEsito(null);
    try {
      const p = preparaPacchetto(await leggiPerPassaggio(db), oggi(), new Date().toISOString());
      const url = URL.createObjectURL(new Blob([JSON.stringify(p)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = `vegman-dati-${oggi()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setEsito({ testo: `✅ File scaricato: ${riepilogo(p)}.`, errore: false });
    } catch { setEsito({ testo: 'Non riesco a leggere i dati: riprova.', errore: true }); }
    setOccupato(false);
  }
  async function apri(f: File | undefined) {
    setEsito(null); setPacchetto(null);
    if (!f) return;
    try { setPacchetto(leggiPacchetto(await f.text())); } catch (e) { setEsito({ testo: (e as Error).message, errore: true }); }
  }
  async function copia() {
    if (!pacchetto) return;
    setOccupato(true); setEsito(null);
    try {
      const r = scritture(pacchetto, uid, await giaPresenti(db), data);
      const n = await scriviPassaggio(db, r.scritture, (fatte) => setEsito({ testo: `Copio… ${fatte} di ${r.scritture.length}`, errore: false }));
      setEsito({ testo: `✅ Copiati ${n} documenti${r.saltati ? ` (${r.saltati} già presenti, lasciati come erano)` : ''}. Ora controlla Prodotti, Ingredienti ed eventi.`, errore: false });
      setPacchetto(null);
    } catch { setEsito({ testo: 'Copia non riuscita: riprova (i documenti già copiati restano, quelli che mancano si aggiungono).', errore: true }); }
    setOccupato(false);
  }

  return (
    <section class="scheda" aria-label="Passaggio alla definitiva">
      <h1>Passaggio alla definitiva</h1>
      {ambiente === 'prova' ? (
        <>
          <p>Scarica il file con i dati da portare nella versione definitiva: prodotti e ricette, ingredienti con etichette e allergeni, articoli, acquisti, fatture, fotografie mensili, impostazioni, menu pubblico, eventi futuri con le loro previsioni.</p>
          <p class="nota">Non si portano scontrini, movimenti senza incasso, chiusure, carichi, produzioni ed etichette stampate, inventari: restano qui come archivio. Il magazzino nella definitiva riparte da un inventario nuovo.</p>
          <button type="button" class="primario" disabled={occupato} onClick={() => void scarica()}>⬇ Scarica i dati</button>
        </>
      ) : (
        <>
          <p>Carica il file scaricato dall'app di prova («Passaggio alla definitiva» → «Scarica i dati»). Si può ripetere: i documenti già copiati vengono aggiornati, fatture e fotografie già presenti restano come sono.</p>
          <label class="campo"><span>File dei dati (vegman-dati-….json)</span>
            <input type="file" accept="application/json,.json" aria-label="File dei dati" onChange={(e) => void apri(e.currentTarget.files?.[0])} /></label>
          {pacchetto && (
            <>
              <p class="nota" aria-label="Contenuto del file">Nel file: {riepilogo(pacchetto)}.</p>
              <button type="button" class="primario" disabled={occupato} onClick={() => void copia()}>Copia nella definitiva</button>
            </>
          )}
        </>
      )}
      {esito && <p class={esito.errore ? 'esito errore' : 'esito'} role={esito.errore ? 'alert' : 'status'}>{esito.testo}</p>}
    </section>
  );
}
