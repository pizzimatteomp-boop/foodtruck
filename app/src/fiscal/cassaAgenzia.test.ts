import { describe, expect, it } from 'vitest';
import { collegaAgenzia, conRiaccesso, RINNOVA_DOPO_MS } from './cassaAgenzia';
import { archivioInMemoria, NonEmesso } from './emissione';
import { SimulatoreAgenzia } from './simulatore';
import { SessioneScaduta, type Richiesta, type Trasporto } from './trasporto';

/** Agenzia finta: il simulatore, con i dati dell'esercente nella forma vera di «dati/fiscali» (inventati). */
function agenziaFinta() {
  const sim = new SimulatoreAgenzia(5000);
  const chiamate: string[] = [];
  const t: Trasporto = {
    async invia(r: Richiesta) {
      chiamate.push(`${r.metodo} ${r.percorso}`);
      if (r.percorso === 'doc/documenti/dati/fiscali' && sim.sessioneValida) {
        return { stato: 200, tipo: 'application/json', corpo: {
          identificativiFiscali: { codicePaese: 'IT', partitaIva: '00000000000', codiceFiscale: 'RSSMRA80A01H501U' },
          altriDatiIdentificativi: { nome: 'MARIO', cognome: 'ROSSI', indirizzo: 'VIA FINTA 1', cap: '00000', comune: 'PROVA', provincia: 'XX' },
          multiAttivita: [],
        } };
      }
      return sim.invia(r);
    },
  };
  return { sim, t, chiamate };
}
const KEBAB = { descrizione: 'Kebab', quantita: 2, prezzo: 12, aliquota: '10' as const };
const QUANDO = () => new Date('2026-11-11T19:00:00Z');

describe('cassa collegata all\'Agenzia (provata su un\'Agenzia finta)', () => {
  it('collega, emette, annulla e scarica il PDF con l\'esercente letto dall\'Agenzia', async () => {
    const { sim, t } = agenziaFinta();
    const c = await collegaAgenzia(t, archivioInMemoria(), QUANDO);
    expect(c.cedente).toMatchObject({ cognome: 'ROSSI', nazione: 'IT' });
    const r = await c.vendi([KEBAB], 'elettronico');
    expect(r.stato).toBe('emesso');
    const doc = sim.documenti[0]!.documento as unknown as { documentoCommerciale: { vendita: { tipo: string; importo: string }[] }; cedentePrestatore: { altriDatiIdentificativi: { cognome: string } } };
    expect(doc.documentoCommerciale.vendita.find((v) => v.tipo === 'PE')!.importo).toBe('24.00');
    expect(doc.cedentePrestatore.altriDatiIdentificativi.cognome).toBe('ROSSI');
    expect(new TextDecoder().decode(await c.pdf(r.idtrx))).toContain(r.progressivo);
    await c.annulla(r.idtrx);
    expect(sim.documenti[1]!.tipo).toBe('A');
    await c.vendi([KEBAB], 'contanti');
    expect(await c.sospeso()).toBeNull();
    await c.mantieniViva();
  });

  it('sessione scaduta: nuovo accesso automatico e la vendita parte una volta sola', async () => {
    const { sim, t } = agenziaFinta();
    let accessi = 0;
    const tr = conRiaccesso(t, async () => { accessi++; sim.sessioneValida = true; });
    const c = await collegaAgenzia(tr, archivioInMemoria(), QUANDO);
    sim.sessioneValida = false;
    await c.vendi([KEBAB], 'contanti');
    expect(accessi).toBe(1);
    expect(tr.riaccessi()).toBe(1);
    expect(sim.documenti).toHaveLength(1);
    // più richieste insieme: un solo accesso
    sim.sessioneValida = false;
    await Promise.all([c.mantieniViva(), c.mantieniViva(), c.mantieniViva()]);
    expect(accessi).toBe(2);
  });

  it('la sessione si rinnova prima dei 2 ore (dopo 100 minuti), altrimenti basta una lettura', async () => {
    const { t, chiamate } = agenziaFinta();
    let accessi = 0;
    let ora = Date.parse('2026-11-12T11:00:00Z');
    const tr = conRiaccesso(t, async () => { accessi++; }, ora);
    const c = await collegaAgenzia(tr, archivioInMemoria(), () => new Date(ora));
    ora += 50 * 60 * 1000;
    expect(await c.mantieniViva()).toBe('viva');
    expect(accessi).toBe(0);
    ora += RINNOVA_DOPO_MS - 50 * 60 * 1000;
    const prima = chiamate.length;
    expect(await c.mantieniViva()).toBe('rinnovata');
    expect(accessi).toBe(1);
    expect(chiamate.length).toBe(prima);
    expect(tr.eta(Date.now())).toBeLessThan(1000);
    // senza trasporto con riaccesso: solo la lettura
    const semplice = await collegaAgenzia(t, archivioInMemoria(), () => new Date(ora + 10 * RINNOVA_DOPO_MS));
    expect(await semplice.mantieniViva()).toBe('viva');
  });

  it('se dopo il nuovo accesso è ancora scaduta: niente emesso, si dice', async () => {
    const { sim, t } = agenziaFinta();
    const c = await collegaAgenzia(conRiaccesso(t, async () => { /* accesso che non apre la sessione */ }), archivioInMemoria(), QUANDO);
    sim.sessioneValida = false;
    await expect(c.vendi([KEBAB], 'contanti')).rejects.toBeInstanceOf(SessioneScaduta);
    expect(sim.documenti).toHaveLength(0);
    expect(await c.sospeso()).toBeNull();
  });

  it('accesso rifiutato durante il nuovo accesso: l\'errore arriva a chi chiama, niente emesso', async () => {
    const { sim, t } = agenziaFinta();
    const c = await collegaAgenzia(conRiaccesso(t, async () => { throw new Error('credenziali rifiutate'); }), archivioInMemoria(), QUANDO);
    sim.sessioneValida = false;
    await expect(c.vendi([KEBAB], 'contanti')).rejects.toThrow(/nuovo accesso non riuscito: credenziali rifiutate/);
    expect(sim.documenti).toHaveLength(0);
    // nessun invio resta «in sospeso»: si può riprovare appena l'accesso torna
    expect(await c.sospeso()).toBeNull();
  });

  it('ora vera di default e causa del nuovo accesso senza messaggio', async () => {
    const { sim, t } = agenziaFinta();
    const c = await collegaAgenzia(conRiaccesso(t, () => Promise.reject('boh')), archivioInMemoria());
    await c.vendi([KEBAB], 'contanti');
    sim.sessioneValida = false;
    await expect(c.vendi([KEBAB], 'contanti')).rejects.toThrow(/nuovo accesso non riuscito: errore/);
  });

  it('rete persa prima dell\'invio → non emesso (dopo una vendita precedente), come nel simulatore', async () => {
    const { sim, t } = agenziaFinta();
    const c = await collegaAgenzia(t, archivioInMemoria(), QUANDO);
    await c.vendi([KEBAB], 'contanti');
    sim.guasta('rete-prima');
    await expect(c.vendi([KEBAB], 'contanti')).rejects.toBeInstanceOf(NonEmesso);
    expect(sim.documenti).toHaveLength(1);
    expect(await c.verifica()).toBeNull();
    await c.chiudiAMano();
  });
});
