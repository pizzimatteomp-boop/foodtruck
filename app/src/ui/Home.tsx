import type { Ruolo } from '../firebase/ruoli';

const NOME_RUOLO: Record<Ruolo, string> = { titolare: 'Titolare', cassa: 'Cassa', team: 'Team' };

export function Home({ nome, ruolo }: { nome: string; ruolo: Ruolo }) {
  return (
    <section class="scheda">
      <h1>Ciao {nome}</h1>
      <p>Ruolo: {NOME_RUOLO[ruolo]}</p>
      <p>Le prossime funzioni arriveranno qui.</p>
    </section>
  );
}
