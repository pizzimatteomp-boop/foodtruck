import { describe, expect, it } from 'vitest';
import type { Riga } from './carrello';
import { archivioInMemoria, InvioInSospeso, NonEmesso } from '../fiscal/emissione';
import { CassaProva } from '../fiscal/prova';
import { annota, daEmettere, descriviVoce, emettiVoce, leggiRegistro, risoltaAMano, segnaEmessa, testoRegistro, type Registro } from './emergenza';

const K: Riga = { prodotto: 'k', descrizione: 'Kebab', quantita: 2, centesimi: 1200, aliquota: '10' };
const QUANDO = Date.UTC(2026, 10, 11, 19, 30);
const base = { quando: QUANDO, evento: 'ev1', cassa: 'Cassa 1', righe: [K], pagamento: 'contanti' as const, motivo: 'Agenzia non raggiungibile' };

describe('registro di emergenza', () => {
  it('annota con numero progressivo, emette, conserva la traccia', () => {
    let r = annota([], base);
    r = annota(r, { ...base, cassa: 'Furgone', pagamento: 'elettronico', sumup: 'TX1' });
    expect(r.map((x) => x.numero)).toEqual([1, 2]);
    expect(daEmettere(r, 'ev1', 'Cassa 1')).toHaveLength(1);
    expect(daEmettere(r, 'ev2')).toHaveLength(0);
    r = segnaEmessa(r, 1, { idtrx: '9', progressivo: 'DCW2026/9999-1', quando: QUANDO + 600000 });
    expect(daEmettere(r)).toHaveLength(1);
    expect(() => segnaEmessa(r, 1, { idtrx: '9', progressivo: 'x', quando: 0 })).toThrow(/già emessa/);
    expect(descriviVoce(r[0]!)).toBe('n. 1 · 11/11/2026, 20:30 · Cassa 1 · 24,00 € contanti · 2× Kebab · Agenzia non raggiungibile · emesso DCW2026/9999-1 il 11/11/2026, 20:40');
    expect(testoRegistro([...r].reverse())).toBe(`VegMan · registro di emergenza\n${descriviVoce(r[0]!)}\n${descriviVoce(r[1]!)}`);
    expect(descriviVoce(r[1]!)).toContain('carta (SumUp TX1)');
    expect(descriviVoce(r[1]!)).toContain('DA EMETTERE');
    // la voce annotata non cambia se il carrello cambia dopo
    const righe = [{ ...K }];
    const r2 = annota([], { ...base, righe });
    righe[0]!.quantita = 99;
    expect(r2[0]!.righe[0]!.quantita).toBe(2);
  });

  it('niente voci vuote; lettura', () => {
    expect(() => annota([], { ...base, righe: [] })).toThrow(/vuoto/);
    expect(leggiRegistro(null)).toEqual([]);
    expect(leggiRegistro(JSON.stringify(annota([], base)))).toHaveLength(1);
    expect(() => leggiRegistro('{}')).toThrow(/illeggibile/);
  });
});

describe('regolarizzazione: si emette appena torna la rete, senza doppioni', () => {
  const cassa = () => new CassaProva(archivioInMemoria(), () => new Date(QUANDO));

  it('voce da emettere → scontrino; senza rete resta da emettere', async () => {
    const c = cassa();
    let r = annota([], base);
    c.simulatore.fuoriRete = true;
    await expect(emettiVoce(r, 1, c, QUANDO)).rejects.toBeInstanceOf(InvioInSospeso);
    // la prima vendita in assoluto non si può dare per non emessa: va verificata quando torna la rete
    c.simulatore.fuoriRete = false;
    await c.verifica().catch(() => undefined);
    await c.chiudiAMano();
    const e = await emettiVoce(r, 1, c, QUANDO + 1);
    expect(e).toMatchObject({ tipo: 'emessa', recuperata: false });
    if (e.tipo === 'emessa') r = e.registro;
    expect(r[0]!.emesso?.progressivo).toMatch(/^DCW2026\/9999-/);
    expect(c.simulatore.documenti).toHaveLength(1);
    await expect(emettiVoce(r, 1, c, 0)).rejects.toThrow(/già emessa/);
  });

  it('da verificare ed emessa davvero → recuperata, mai riemessa', async () => {
    const c = cassa();
    await c.vendi([{ descrizione: 'Acqua', quantita: 1, prezzo: 1.5, aliquota: '22' }], 'contanti');
    c.simulatore.guasta('rete-dopo', 'rete-prima'); // l'Agenzia emette, la risposta si perde, la verifica fallisce
    await expect(c.vendi([{ descrizione: 'Kebab', quantita: 2, prezzo: 12, aliquota: '10' }], 'contanti')).rejects.toBeInstanceOf(InvioInSospeso);
    const r: Registro = annota([], base).map((v) => ({ ...v, daVerificare: true as const }));
    expect(descriviVoce(r[0]!)).toContain('DA VERIFICARE');
    c.simulatore.fuoriRete = true;
    expect(await emettiVoce(r, 1, c, QUANDO)).toMatchObject({ tipo: 'ferma', messaggio: expect.stringMatching(/riprova/) });
    c.simulatore.fuoriRete = false;
    const e = await emettiVoce(r, 1, c, QUANDO);
    expect(e).toMatchObject({ tipo: 'emessa', recuperata: true });
    expect(c.simulatore.documenti).toHaveLength(2);
  });

  it('da verificare e non emessa → diventa da emettere ed esce una volta sola', async () => {
    const c = cassa();
    await c.vendi([{ descrizione: 'Acqua', quantita: 1, prezzo: 1.5, aliquota: '22' }], 'contanti');
    c.simulatore.guasta('rete-prima', 'rete-prima');
    await expect(c.vendi([{ descrizione: 'Kebab', quantita: 2, prezzo: 12, aliquota: '10' }], 'contanti')).rejects.toBeInstanceOf(InvioInSospeso);
    const r: Registro = annota([], base).map((v) => ({ ...v, daVerificare: true as const }));
    const e = await emettiVoce(r, 1, c, QUANDO);
    expect(e).toMatchObject({ tipo: 'emessa', recuperata: false });
    if (e.tipo === 'emessa') expect(e.registro[0]).not.toHaveProperty('daVerificare');
    expect(c.simulatore.documenti).toHaveLength(2);
  });

  it('non verificabile in automatico → si risolve a mano', async () => {
    const c = cassa();
    const r: Registro = annota(annota([], base), base).map((v) => ({ ...v, daVerificare: true as const }));
    expect(await emettiVoce(r, 1, c, QUANDO)).toMatchObject({ tipo: 'ferma', aMano: true });
    const trovata = risoltaAMano(r, 1, true, QUANDO);
    expect(trovata[0]!.emesso).toMatchObject({ aMano: true });
    expect(descriviVoce(trovata[0]!)).toContain('trovato sul portale');
    const nonTrovata = risoltaAMano(trovata, 2, false, QUANDO);
    expect(daEmettere(nonTrovata)).toHaveLength(1);
    expect(() => risoltaAMano(nonTrovata, 2, true, 0)).toThrow(/non da verificare/);
  });

  it('gli errori di emissione arrivano a chi chiama', async () => {
    const c = cassa();
    await c.vendi([{ descrizione: 'Acqua', quantita: 1, prezzo: 1.5, aliquota: '22' }], 'contanti');
    c.simulatore.guasta('rete-prima');
    await expect(emettiVoce(annota([], base), 1, c, QUANDO)).rejects.toBeInstanceOf(NonEmesso);
    const v = { ...annota([], base)[0]!, daVerificare: true as const };
    const guasta = { ...c, sospeso: async () => ({}) as never, verifica: async () => { throw new Error('boh'); }, vendi: c.vendi.bind(c) };
    await expect(emettiVoce([v], 1, guasta, QUANDO)).rejects.toThrow('boh');
  });
});
