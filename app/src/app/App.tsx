/** Stato dell'accesso e pagina corrente; sceglie cosa mostrare. */
import { useEffect, useState } from 'preact/hooks';
import { osservaAccesso, type Servizi } from '../firebase/accesso';
import type { Ambiente } from '../firebase/config';
import type { Profilo } from '../firebase/profilo';
import { Accesso } from '../ui/Accesso';
import { Allergeni } from '../ui/Allergeni';
import { Avvisi, FotografiaAutomatica } from '../ui/Avvisi';
import { Resoconto } from '../ui/Resoconto';
import { Fatture } from '../ui/Fatture';
import { GestioneMenu } from '../ui/GestioneMenu';
import { MenuPubblico } from '../ui/MenuPubblico';
import { Home } from '../ui/Home';
import { Importa } from '../ui/Importa';
import { Cassa } from '../ui/Cassa';
import { CassaProva } from '../ui/CassaProva';
import { Ingredienti } from '../ui/Ingredienti';
import { Persone } from '../ui/Persone';
import { Prodotti } from '../ui/Prodotti';
import { Struttura } from '../ui/Struttura';
import type { StatoSchermata } from '../ui/schermata';
import { paginaDa, parametroDa } from './navigazione';

type Stato = Exclude<StatoSchermata, { stato: 'dentro' }> | { stato: 'dentro'; uid: string; profilo: Profilo; email: string };

function useHash(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const aggiorna = () => setHash(location.hash);
    window.addEventListener('hashchange', aggiorna);
    return () => window.removeEventListener('hashchange', aggiorna);
  }, []);
  return hash;
}

export function App({ servizi, ambiente }: { servizi: Servizi; ambiente: Ambiente }) {
  const [stato, setStato] = useState<Stato>({ stato: 'avvio' });
  const hash = useHash();

  useEffect(() => osservaAccesso(servizi, (s) => {
    if (s.stato === 'dentro') setStato({ stato: 'dentro', uid: s.utente.uid, profilo: s.profilo, email: s.profilo.email || (s.utente.email ?? '') });
    else setStato(s);
  }), [servizi]);

  // Menu pubblico (QR code): aperto a tutti, senza accesso.
  if (/^#\/menu(\?|$)/.test(hash)) return <MenuPubblico db={servizi.db} hash={hash} />;
  if (stato.stato !== 'dentro') {
    return <Accesso stato={stato} servizi={servizi} ambiente={ambiente} onErrore={(errore) => setStato({ stato: 'fuori', errore })} />;
  }
  const pagina = paginaDa(hash, stato.profilo.ruolo);
  return (
    <Struttura servizi={servizi} ambiente={ambiente} profilo={stato.profilo} pagina={pagina}>
      {stato.profilo.ruolo === 'titolare' && <FotografiaAutomatica db={servizi.db} uid={stato.uid} />}
      {pagina.id === 'persone' ? <Persone db={servizi.db} titolareUid={stato.uid} />
        : pagina.id === 'vendi' ? <Cassa db={servizi.db} uid={stato.uid} titolare={stato.profilo.ruolo === 'titolare'} />
        : pagina.id === 'cassa' ? <CassaProva db={servizi.db} titolare={stato.profilo.ruolo === 'titolare'} />
        : pagina.id === 'importa' ? <Importa db={servizi.db} uid={stato.uid} />
        : pagina.id === 'prodotti' ? <Prodotti db={servizi.db} parametro={parametroDa(hash)} />
        : pagina.id === 'avvisi' ? <Avvisi db={servizi.db} />
        : pagina.id === 'resoconto' ? <Resoconto db={servizi.db} />
        : pagina.id === 'pubblica' ? <GestioneMenu db={servizi.db} uid={stato.uid} parametro={parametroDa(hash)} />
        : pagina.id === 'allergeni' ? <Allergeni db={servizi.db} />
        : pagina.id === 'fatture' ? <Fatture db={servizi.db} uid={stato.uid} />
        : pagina.id === 'ingredienti' ? <Ingredienti db={servizi.db} parametro={parametroDa(hash)} />
        : <Home nome={stato.profilo.nome || stato.email} ruolo={stato.profilo.ruolo} />}
    </Struttura>
  );
}
