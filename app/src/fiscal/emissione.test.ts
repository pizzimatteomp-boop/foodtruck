import { documentoAnnullo, documentoVendita, type Cedente } from './dco';
import {
  archivioInMemoria, chiudiSospesoAMano, corrisponde, emettiVendita, inviaAnnulloReso, InvioInSospeso, NonEmesso, verificaSospeso,
} from './emissione';
import { ServizioDCO } from './servizio';
import { SimulatoreAgenzia, type Guasto } from './simulatore';
import { RifiutoAgenzia, SessioneScaduta } from './trasporto';

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
  it('cade prima dell\'invio: «non emesso», riprovando se ne emette uno solo', async () => {
    const { sim, s, a } = prepara();
    sim.guasta('rete-prima');
    await expect(emettiVendita(s, a, vendita(), QUANDO)).rejects.toThrow(NonEmesso);
    expect(sim.documenti).toHaveLength(0);
    await emettiVendita(s, a, vendita(), QUANDO);
    expect(sim.documenti).toHaveLength(1);
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
    sim.guasta('errore-500');
    await expect(emettiVendita(s, a, vendita(), QUANDO)).rejects.toThrow(NonEmesso);
    expect(sim.documenti).toHaveLength(0);
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
