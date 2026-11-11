/** Pagina «Avvisi» (titolare): cosa richiede attenzione su food cost, prezzi, fatture, etichette e menu. */
import type { Firestore } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { oggi } from '../dati/oggi';
import { useRaccolta } from '../dati/useRaccolta.db';
import type { Acquisto, Articolo, Ingrediente, Prodotto } from '../foodcost/modello';
import { costruisciMenu, stessoMenu } from '../menu/menu';
import { useMenuPubblicato } from '../menu/menu.db';
import { avvisiFoodCost, fotografia, fotografiaDaSalvare, nomeMese, type Avviso } from '../storico/storico';
import { salvaFotografia, salvaSogliaRincaro, useFotografie, useSogliaRincaro } from '../storico/storico.db';
import { avvisiQuadrature } from '../cassa/quadratura';
import { useQuadrature } from '../cassa/quadratura.db';
import type { Evento } from '../eventi/eventi';

const ICONE: Record<Avviso['tipo'], string> = { soglia: '🔴', rincaro: '📈', 'senza-prezzo': '❓', 'prezzo-vecchio': '🕰' };

function useDatiFoodCost(db: Firestore) {
  const pro = useRaccolta<Prodotto>(db, 'prodotti');
  const ing = useRaccolta<Ingrediente>(db, 'ingredienti');
  const art = useRaccolta<Articolo>(db, 'articoli');
  const acq = useRaccolta<Acquisto>(db, 'acquisti');
  return {
    dati: { prodotti: pro.dati, ingredienti: ing.dati, articoli: art.dati, acquisti: acq.dati },
    caricato: pro.caricato && ing.caricato && art.caricato && acq.caricato,
    errore: pro.errore || ing.errore || art.errore || acq.errore,
  };
}

/** Salva da sola la fotografia del mese scorso, la prima volta che il titolare apre l'app nel mese nuovo. */
export function FotografiaAutomatica({ db, uid }: { db: Firestore; uid: string }) {
  const { dati, caricato } = useDatiFoodCost(db);
  const { fotografie, caricato: fotoCaricate } = useFotografie(db);
  const fatto = useRef(false);
  useEffect(() => {
    if (!caricato || !fotoCaricate || fatto.current) return;
    const mese = fotografiaDaSalvare(oggi(), new Set(fotografie.keys()), dati.acquisti);
    fatto.current = true;
    if (mese) void salvaFotografia(db, fotografia(mese, dati), uid).catch(() => { fatto.current = false; });
  }, [caricato, fotoCaricate]);
  return null;
}

export function Avvisi({ db }: { db: Firestore }) {
  const { dati, caricato, errore } = useDatiFoodCost(db);
  const { fotografie } = useFotografie(db);
  const soglia = useSogliaRincaro(db);
  const pub = useMenuPubblicato(db);
  const quadrature = useQuadrature(db);
  const eventi = useRaccolta<Evento>(db, 'eventi');
  const [nuovaSoglia, setNuovaSoglia] = useState('');
  const [esito, setEsito] = useState('');
  const foodCost = useMemo(() => (caricato ? avvisiFoodCost(dati, oggi(), soglia) : []), [caricato, dati.prodotti, dati.ingredienti, dati.articoli, dati.acquisti, soglia]);
  const menu = useMemo(() => costruisciMenu(dati.prodotti, dati.ingredienti), [dati.prodotti, dati.ingredienti]);

  if (errore) return <section class="scheda"><p class="errore">{errore}</p></section>;
  if (!caricato || !pub.caricato) return <section class="scheda"><p>Caricamento…</p></section>;
  const daControllare = dati.articoli.filter((a) => a.categoria === null).length;
  const menuDaPubblicare = !!pub.menu && !stessoMenu(pub.menu.voci, menu.voci);
  const altri = [
    daControllare > 0 && { testo: `${daControllare} ${daControllare === 1 ? 'articolo' : 'articoli'} delle fatture da controllare`, link: '#/fatture' },
    menu.bloccanti.length > 0 && { testo: `Menu: ${menu.bloccanti.length} dati da sistemare prima di pubblicare`, link: '#/pubblica' },
    menuDaPubblicare && { testo: 'Menu: ci sono modifiche non ancora pubblicate', link: '#/pubblica' },
    ...avvisiQuadrature(quadrature.dati, (id) => eventi.dati.find((e) => e.id === id)?.nome ?? 'evento').map((testo) => ({ testo, link: '#/vendi' })),
  ].filter(Boolean) as { testo: string; link: string }[];
  const totale = foodCost.length + altri.length;

  async function salvaSoglia(ev: Event) {
    ev.preventDefault();
    const v = Number(nuovaSoglia.replace(',', '.'));
    if (!(v > 0 && v <= 100)) { setEsito('Scrivi un numero tra 1 e 100.'); return; }
    await salvaSogliaRincaro(db, v);
    setEsito('Soglia salvata.');
    setNuovaSoglia('');
  }

  return (
    <section class="scheda" aria-label="Avvisi">
      <h1>Avvisi</h1>
      <p aria-label="Riepilogo avvisi">{totale === 0 ? 'Tutto in ordine.' : `${totale} ${totale === 1 ? 'cosa richiede' : 'cose richiedono'} attenzione.`}</p>

      {foodCost.length > 0 && (
        <>
          <h2>Food cost e prezzi</h2>
          <ul class="elenco" aria-label="Avvisi food cost">{foodCost.map((a) => (
            <li key={a.testo}><a href={a.link}><span class="nome"><span aria-hidden="true">{ICONE[a.tipo]} </span>{a.testo}</span></a></li>
          ))}</ul>
        </>
      )}
      {altri.length > 0 && (
        <>
          <h2>Da fare</h2>
          <ul class="elenco" aria-label="Da fare">{altri.map((a) => <li key={a.testo}><a href={a.link}><span class="nome">{a.testo}</span></a></li>)}</ul>
        </>
      )}

      <h2>Impostazioni</h2>
      <form class="conversione" onSubmit={salvaSoglia}>
        Avvisami se un ingrediente rincara più del
        <input aria-label="Soglia rincaro" inputMode="decimal" class="corto" placeholder={String(soglia)} value={nuovaSoglia} onInput={(e) => setNuovaSoglia(e.currentTarget.value)} />
        % rispetto al mese prima
        <button type="submit" class="secondario piccolo">Salva</button>
      </form>
      {esito && <p role="status">{esito}</p>}
      <p class="nota">Soglia attuale: {soglia}%. Le soglie di food cost si impostano nella scheda di ogni prodotto.</p>

      <h2>Fotografie mensili</h2>
      <p class="nota" aria-label="Fotografie salvate">{fotografie.size === 0
        ? 'Nessuna ancora: la prima si salverà da sola all\'inizio del prossimo mese.'
        : `Salvate: ${[...fotografie.keys()].sort().map((m) => nomeMese(m, true)).join(', ')}.`}</p>
    </section>
  );
}
