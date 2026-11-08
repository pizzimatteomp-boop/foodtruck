import { documentoAnnullo, documentoVendita, type Cedente } from './dco';
import {
  archivioInMemoria, chiudiSospesoAMano, corrisponde, emettiVendita, inviaAnnulloReso, InvioInSospeso, NonEmesso, verificaSospeso,
} from './emissione';
import { ServizioDCO } from './servizio';
import { SimulatoreAgenzia, type Guasto } from './simulatore';
import { ErroreServizio, RifiutoAgenzia, SessioneScaduta, type Trasporto } from './trasporto';

// Dati inventati: nessuno scontrino vero, tutto sul simulatore.
const CEDENTE: Cedente = { partitaIva: '00000000000', codiceFiscale: 'XXXXXX00X00X000X', nome: 'PROVA', cognome: 'PROVA', indirizzo: 'VIA PROVA 1', cap: '00000', comune: 'PROVA', provincia: 'XX', nazione: 'IT' };
const QUANDO = new Date('2026-11-07T12:00:00Z');
const vendita = (prezzo = 12, descrizione = 'Kebab') =>
  documentoVendita({ cedente: CEDENTE, righe: [{ descrizione, quantita: 1, prezzoLordo: prezzo, aliquotaIVA: '10' }], pagamenti: { contanti: prezzo }, quando: QUANDO });

function prepara() {
  const sim = new SimulatoreAgenzia();
  return { sim, s: new ServizioDCO(sim), a: archivioInMemoria() };
}

describe('emissione normale', () => {
  it('emesso, PDF leggibile, ultima emessa ricordata, niente in sospeso', async () => {
    const { sim, s, a } = prepara();
    const r = await emettiVendita(s, a, vendita(), QUANDO);
    expect(r).toMatchObject({ stato: 'emesso', progressivo: expect.stringMatching(/^DCW2026\//) });
    expect(sim.documenti).toHaveLength(1);
    expect(a.stato).toEqual({ sospeso: null, ultima: r.idtrx });
    expect(new TextDecoder().decode(await s.pdf(r.idtrx))).toContain('%PDF');
    expect(await s.datiFiscali()).toMatchObject({ denominazione: 'SIMULATORE' });
  });

  it('rifiuto dell\'Agenzia (errore di contenuto): niente emesso, si sa perché', async () => {
    const { sim, s, a } = prepara();
    const doc = vendita();
    doc.cedentePrestatore.altriDatiIdentificativi.nazione = '';
    await expect(emettiVendita(s, a, doc, QUANDO)).rejects.toThrow(RifiutoAgenzia);
    await expect(emettiVendita(s, a, doc, QUANDO)).rejects.toThrow("'Nazione' non presente");
    expect(sim.documenti).toHaveLength(0);
    expect(a.stato.sospeso).toBeNull();
  });

  it('sessione scaduta: niente emesso, serve un nuovo accesso', async () => {
    const { sim, s, a } = prepara();
    sim.guasta('sessione');
    await expect(emettiVendita(s, a, vendita(), QUANDO)).rejects.toThrow(SessioneScaduta);
    expect(sim.documenti).toHaveLength(0);
    expect(a.stato.sospeso).toBeNull();
  });
});

describe('rete che cade: mai scontrini doppi', () => {
  it('cade prima dell\'invio: «non emesso» (l\'Agenzia indica ancora la vendita precedente), riprovando se ne emette uno solo', async () => {
    const { sim, s, a } = prepara();
    await emettiVendita(s, a, vendita(5, 'Patate'), QUANDO);
    sim.guasta('rete-prima');
    await expect(emettiVendita(s, a, vendita(), QUANDO)).rejects.toThrow(NonEmesso);
    expect(sim.documenti).toHaveLength(1);
    await emettiVendita(s, a, vendita(), QUANDO);
    expect(sim.documenti).toHaveLength(2);
  });

  it('prudenza: se l\'Agenzia non indica nessuna ultima vendita, o una diversa, resta in sospeso (verifica a mano)', async () => {
    const { sim, s, a } = prepara();
    sim.guasta('rete-prima');
    await expect(emettiVendita(s, a, vendita(), QUANDO)).rejects.toThrow(InvioInSospeso);
    expect(a.stato.sospeso).not.toBeNull();
    await chiudiSospesoAMano(a);
    // un'altra cassa (o il portale) ha emesso una vendita diversa
    await new ServizioDCO(sim).invia(vendita(99, 'Altro'));
    await emettiVendita(s, a, vendita(5, 'Patate'), QUANDO);
    await new ServizioDCO(sim).invia(vendita(98, 'Altro'));
    sim.guasta('rete-prima');
    await expect(emettiVendita(s, a, vendita(), QUANDO)).rejects.toThrow(InvioInSospeso);
  });

  it('cade dopo che l\'Agenzia ha emesso: lo scontrino viene recuperato, non riemesso', async () => {
    const { sim, s, a } = prepara();
    sim.guasta('rete-dopo');
    const r = await emettiVendita(s, a, vendita(), QUANDO);
    expect(r.stato).toBe('recuperato');
    expect(r.idtrx).toBe(sim.documenti[0]!.idtrx);
    expect(sim.documenti).toHaveLength(1);
    expect(a.stato).toEqual({ sospeso: null, ultima: r.idtrx });
  });

  it('errore 500: si verifica e risulta non emesso', async () => {
    const { sim, s, a } = prepara();
    await emettiVendita(s, a, vendita(5, 'Patate'), QUANDO);
    sim.guasta('errore-500');
    await expect(emettiVendita(s, a, vendita(), QUANDO)).rejects.toThrow(NonEmesso);
    expect(sim.documenti).toHaveLength(1);
  });

  it('non si riesce nemmeno a verificare: tutto bloccato finché non si chiarisce, poi recuperato', async () => {
    const { sim, s, a } = prepara();
    sim.guasta('rete-dopo', 'rete-prima');
    await expect(emettiVendita(s, a, vendita(), QUANDO)).rejects.toThrow(InvioInSospeso);
    // un'altra vendita ora NON parte
    await expect(emettiVendita(s, a, vendita(5, 'Patate'), QUANDO)).rejects.toThrow(InvioInSospeso);
    expect(sim.documenti).toHaveLength(1);
    // torna la rete (anche dopo un riavvio dell'app: l'annotazione è sul dispositivo)
    const r = await verificaSospeso(s, a);
    expect(r).toMatchObject({ stato: 'recuperato', idtrx: sim.documenti[0]!.idtrx });
    await emettiVendita(s, a, vendita(5, 'Patate'), QUANDO);
    expect(sim.documenti).toHaveLength(2);
    expect(await verificaSospeso(s, a)).toBeNull();
  });

  it('due vendite identiche di fila: la seconda persa non viene scambiata per la prima', async () => {
    const { sim, s, a } = prepara();
    await emettiVendita(s, a, vendita(), QUANDO);
    sim.guasta('rete-prima');
    await expect(emettiVendita(s, a, vendita(), QUANDO)).rejects.toThrow(NonEmesso);
    await emettiVendita(s, a, vendita(), QUANDO);
    expect(sim.documenti).toHaveLength(2);
  });

  it('prova a raffica: 300 vendite con guasti casuali, riprovando → esattamente 300 scontrini', async () => {
    const { sim, s, a } = prepara();
    let seme = 42;
    const caso = () => ((seme = (seme * 1103515245 + 12345) % 2147483648) / 2147483648);
    const tipi: (Guasto | null)[] = [null, null, null, 'rete-prima', 'rete-dopo', 'errore-500', 'sessione'];
    const emessi = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const doc = vendita(5 + (i % 4), i % 3 ? 'Kebab' : 'Patate');
      for (let tentativo = 0; ; tentativo++) {
        expect(tentativo).toBeLessThan(50);
        const g = tipi[Math.floor(caso() * tipi.length)];
        if (g) sim.guasta(g);
        if (caso() < 0.2) sim.guasta('rete-prima'); // a volte cade anche la verifica
        try {
          const r = await emettiVendita(s, a, doc, QUANDO);
          emessi.add(r.idtrx);
          break;
        } catch (e) {
          if (e instanceof InvioInSospeso) {
            const r = await verificaSospeso(s, a).catch(() => undefined);
            if (r) { emessi.add(r.idtrx); break; }
            continue;
          }
          if (e instanceof NonEmesso || e instanceof SessioneScaduta) continue;
          throw e;
        }
      }
    }
    expect(sim.documenti).toHaveLength(300);
    expect(emessi.size).toBe(300);
  });
});

describe('annulli', () => {
  it('annullo di uno scontrino letto dall\'Agenzia (valori grezzi riformattati); doppio annullo rifiutato', async () => {
    const { sim, s, a } = prepara();
    const v = await emettiVendita(s, a, vendita(1.5, 'Acqua'), QUANDO);
    const letto = await s.documento(v.idtrx);
    expect(letto.documentoCommerciale.elementiContabili[0]!.prezzoLordo).toBe('1.5');
    const an = await inviaAnnulloReso(s, a, documentoAnnullo({ cedente: CEDENTE, originale: letto, quando: QUANDO }), QUANDO);
    expect(an.stato).toBe('emesso');
    expect(sim.documenti.map((d) => d.tipo)).toEqual(['V', 'A']);
    await expect(inviaAnnulloReso(s, a, documentoAnnullo({ cedente: CEDENTE, originale: letto, quando: QUANDO }), QUANDO)).rejects.toThrow('già annullato');
    // l'ultima vendita resta la vendita, non l'annullo
    expect((await s.ultimaVendita())!.idtrx).toBe(v.idtrx);
  });

  it('risposta persa su un annullo: resta in sospeso finché il titolare non verifica sul portale', async () => {
    const { sim, s, a } = prepara();
    const v = await emettiVendita(s, a, vendita(), QUANDO);
    const letto = await s.documento(v.idtrx);
    sim.guasta('rete-dopo');
    await expect(inviaAnnulloReso(s, a, documentoAnnullo({ cedente: CEDENTE, originale: letto, quando: QUANDO }), QUANDO)).rejects.toThrow(InvioInSospeso);
    expect(a.stato.sospeso).toMatchObject({ tipo: 'A', progressivoOriginale: v.progressivo });
    await expect(verificaSospeso(s, a)).rejects.toThrow(InvioInSospeso);
    await expect(emettiVendita(s, a, vendita(), QUANDO)).rejects.toThrow(InvioInSospeso);
    await chiudiSospesoAMano(a);
    await emettiVendita(s, a, vendita(), QUANDO);
    expect(sim.documenti.map((d) => d.tipo)).toEqual(['V', 'A', 'V']);
  });
});

describe('confronto con l\'ultimo scontrino', () => {
  it('stesse righe e stessa data; righe o data diverse non corrispondono', async () => {
    const { s, a } = prepara();
    const doc = vendita();
    await emettiVendita(s, a, doc, QUANDO);
    const u = (await s.ultimaVendita())!;
    const imp = { data: '07/11/2026', righe: [{ descrizione: 'Kebab', quantita: 1, prezzo: 12, aliquota: '10' }] };
    expect(corrisponde(u, imp)).toBe(true);
    expect(corrisponde(u, { ...imp, data: '08/11/2026' })).toBe(false);
    expect(corrisponde(u, { ...imp, righe: [{ ...imp.righe[0]!, prezzo: 10 }] })).toBe(false);
    expect(corrisponde(u, { ...imp, righe: [] })).toBe(false);
  });
});

describe('casi rari', () => {
  it('errore sconosciuto del trasporto: l\'invio resta in sospeso (prudenza) finché non si verifica', async () => {
    const { sim, a } = prepara();
    await emettiVendita(new ServizioDCO(sim), a, vendita(5, 'Patate'), QUANDO);
    const rotto: Trasporto = { invia: async (r) => { if (r.metodo === 'POST') throw new TypeError('guasto imprevisto'); return sim.invia(r); } };
    const s = new ServizioDCO(rotto);
    await expect(emettiVendita(s, a, vendita(), QUANDO)).rejects.toThrow('guasto imprevisto');
    await expect(emettiVendita(s, a, vendita(), QUANDO)).rejects.toThrow(InvioInSospeso);
    expect(await verificaSospeso(s, a)).toBeNull(); // l'Agenzia indica ancora la vendita precedente: si può riprovare
    expect(a.stato.sospeso).toBeNull();
    const v = await emettiVendita(new ServizioDCO(sim), a, vendita(), QUANDO);
    const letto = await new ServizioDCO(sim).documento(v.idtrx);
    await expect(inviaAnnulloReso(s, a, documentoAnnullo({ cedente: CEDENTE, originale: letto, quando: QUANDO }), QUANDO)).rejects.toThrow('guasto imprevisto');
    expect(a.stato.sospeso).toMatchObject({ tipo: 'A' });
  });

  it('documento o PDF inesistenti, risposta che non è un PDF, percorsi sconosciuti: errore del servizio', async () => {
    const { sim, s } = prepara();
    await expect(s.documento('000')).rejects.toThrow(ErroreServizio);
    await expect(s.pdf('000')).rejects.toThrow('(404)');
    const strano = new ServizioDCO({ invia: async () => ({ stato: 200, tipo: 'application/json', corpo: { non: 'pdf' } }) });
    await expect(strano.pdf('1')).rejects.toThrow(ErroreServizio);
    expect((await sim.invia({ metodo: 'GET', percorso: 'altro' })).stato).toBe(404);
    expect(await s.ultimaVendita()).toBeNull();
    const vuoto = new ServizioDCO({ invia: async () => ({ stato: 0, tipo: '', corpo: null }) });
    await expect(vuoto.datiFiscali()).rejects.toThrow(ErroreServizio);
  });

  it('sessione scaduta riconosciuta da 401/403 o dal rinvio alla pagina di accesso', async () => {
    for (const r of [{ stato: 401, tipo: 'application/json' }, { stato: 403, tipo: '' }, { stato: 200, tipo: 'application/json', urlFinale: 'https://iampe.agenziaentrate.gov.it/sam/UI/Login' }]) {
      const s = new ServizioDCO({ invia: async () => ({ corpo: null, ...r }) });
      await expect(s.ultimaVendita()).rejects.toThrow(SessioneScaduta);
    }
    const { sim, s } = prepara();
    sim.sessioneValida = false;
    await expect(s.datiFiscali()).rejects.toThrow(SessioneScaduta);
  });

  it('simulatore: documento senza contenuto e reso di uno scontrino inesistente rifiutati', async () => {
    const { s } = prepara();
    await expect(s.invia({})).rejects.toThrow('Documento non valido');
    const finto = { idtrx: '1', datiTrasmissione: { numeroProgressivo: 'DCW2026/0000-0001' }, documentoCommerciale: { elementiContabili: [{ idElementoContabile: '1', descrizioneProdotto: 'X', quantita: '1', prezzoLordo: '1', aliquotaIVA: '10' as const }] } };
    await expect(s.invia(documentoAnnullo({ cedente: CEDENTE, originale: finto, quando: QUANDO }))).rejects.toThrow('non trovato');
    const doc = vendita();
    doc.documentoCommerciale.vendita[0]!.importo = '1.00';
    await expect(s.invia(doc)).rejects.toThrow('Pagamenti diversi');
  });
});
