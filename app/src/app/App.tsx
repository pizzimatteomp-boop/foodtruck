/** Stato dell'accesso e pagina corrente; sceglie cosa mostrare. */
import { useEffect, useState } from 'preact/hooks';
import { osservaAccesso, type Servizi } from '../firebase/accesso';
import type { Ambiente } from '../firebase/config';
import type { Profilo } from '../firebase/profilo';
import { Accesso } from '../ui/Accesso';
import { Fatture } from '../ui/Fatture';
import { Home } from '../ui/Home';
import { Importa } from '../ui/Importa';
import { Ingredienti } from '../ui/Ingredienti';
import { Persone } from '../ui/Persone';
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

  if (stato.stato !== 'dentro') {
    return <Accesso stato={stato} servizi={servizi} ambiente={ambiente} onErrore={(errore) => setStato({ stato: 'fuori', errore })} />;
  }
  const pagina = paginaDa(hash, stato.profilo.ruolo);
  return (
    <Struttura servizi={servizi} ambiente={ambiente} profilo={stato.profilo} pagina={pagina}>
      {pagina.id === 'persone' ? <Persone db={servizi.db} titolareUid={stato.uid} />
        : pagina.id === 'importa' ? <Importa db={servizi.db} uid={stato.uid} />
        : pagina.id === 'fatture' ? <Fatture db={servizi.db} uid={stato.uid} />
        : pagina.id === 'ingredienti' ? <Ingredienti db={servizi.db} parametro={parametroDa(hash)} />
        : <Home nome={stato.profilo.nome || stato.email} ruolo={stato.profilo.ruolo} />}
    </Struttura>
  );
}
