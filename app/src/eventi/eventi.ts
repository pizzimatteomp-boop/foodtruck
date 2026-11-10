/** Eventi (fase «Cassa», C3): ogni scontrino appartiene a un evento; più casse lavorano sullo stesso evento. */
export interface Evento {
  id: string;
  nome: string;
  /** aaaa-mm-gg, primo e ultimo giorno (compresi). */
  dal: string;
  al: string;
  luogo?: string;
  /** Codice del Paese (IT = cassa fiscale italiana). */
  paese: string;
  stato: 'aperto' | 'chiuso';
}

export class ErroreEvento extends Error {
  override name = 'ErroreEvento';
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Dai campi del modulo all'evento da salvare (controlli come le regole del database). */
export function preparaEvento(m: { nome: string; dal: string; al?: string; luogo?: string; paese?: string }): Omit<Evento, 'id'> {
  const nome = m.nome.trim();
  if (!nome) throw new ErroreEvento('Scrivi il nome dell\'evento.');
  if (nome.length > 80) throw new ErroreEvento('Nome troppo lungo (massimo 80 caratteri).');
  if (!DATA.test(m.dal)) throw new ErroreEvento('Scegli il primo giorno.');
  const al = m.al || m.dal;
  if (!DATA.test(al) || al < m.dal) throw new ErroreEvento('L\'ultimo giorno non può essere prima del primo.');
  const paese = (m.paese || 'IT').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(paese)) throw new ErroreEvento('Paese: due lettere (es. IT, SM).');
  const luogo = (m.luogo ?? '').trim();
  if (luogo.length > 120) throw new ErroreEvento('Luogo troppo lungo.');
  return { nome, dal: m.dal, al, ...(luogo ? { luogo } : {}), paese, stato: 'aperto' };
}

/** Eventi aperti in ordine: prima quelli in corso oggi, poi i prossimi (dal più vicino), poi i passati (dal più recente). */
export function eventiPerCassa(eventi: readonly Evento[], oggi: string): Evento[] {
  const fase = (e: Evento) => (e.dal <= oggi && oggi <= e.al ? 0 : e.dal > oggi ? 1 : 2);
  return eventi.filter((e) => e.stato === 'aperto').sort((a, b) => fase(a) - fase(b)
    || (fase(a) === 2 ? b.al.localeCompare(a.al) : a.dal.localeCompare(b.dal)) || a.nome.localeCompare(b.nome, 'it'));
}

/** È in corso oggi? */
export const inCorso = (e: Pick<Evento, 'dal' | 'al'>, oggi: string) => e.dal <= oggi && oggi <= e.al;

/** Fuori dall'Italia la cassa fiscale italiana non si usa (ricevuta del luogo: da definire col commercialista). */
export const fuoriItalia = (e: Pick<Evento, 'paese'>) => e.paese !== 'IT';

export function descriviEvento(e: Evento): string {
  const giorni = e.dal === e.al ? gg(e.dal) : `${gg(e.dal)}–${gg(e.al)}`;
  return `${e.nome} · ${giorni}${e.luogo ? ` · ${e.luogo}` : ''}${e.paese !== 'IT' ? ` · ${e.paese}` : ''}`;
}
const gg = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
