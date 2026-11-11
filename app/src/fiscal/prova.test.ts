import { describe, expect, it } from 'vitest';
import { archivioInMemoria, InvioInSospeso, NonEmesso } from './emissione';
import { CassaProva, totaleRighe, type RigaCassa } from './prova';
import { SessioneScaduta } from './trasporto';

const KEBAB: RigaCassa = { descrizione: 'Kebab', quantita: 2, prezzo: 12, aliquota: '10' };
const PATATE: RigaCassa = { descrizione: 'Patate', quantita: 1, prezzo: 5, aliquota: '10' };
const QUANDO = () => new Date('2026-11-07T12:00:00Z');

describe('cassa di prova (solo simulatore)', () => {
  it('vende, annulla, e il simulatore vede solo l\'esercente inventato', async () => {
    const c = new CassaProva(archivioInMemoria(), QUANDO);
    const r = await c.vendi([KEBAB, PATATE], 'elettronico');
    expect(r.stato).toBe('emesso');
    expect(c.scontrini[0]).toMatchObject({ totale: 29, annullato: false, recuperato: false });
    const doc = c.simulatore.documenti[0]!.documento as unknown as { documentoCommerciale: { vendita: { tipo: string; importo: string }[] } };
    expect(JSON.stringify(doc)).not.toContain('02948500422');
    expect(doc.documentoCommerciale.vendita.find((v) => v.tipo === 'PE')!.importo).toBe('29.00');
    await c.annulla(r.idtrx);
    expect(c.scontrini[0]!.annullato).toBe(true);
    await expect(c.annulla(r.idtrx)).rejects.toThrow(/già annullato/);
    await expect(c.annulla('nessuno')).rejects.toThrow();
    expect(new TextDecoder().decode(await c.pdf(r.idtrx))).toContain('SIMULATORE');
    await c.mantieniViva();
    expect(c.ambiente).toBe('simulatore');
  });

  it('numerazione di partenza: riaprendo la cassa i numeri non si ripetono', async () => {
    const c = new CassaProva(archivioInMemoria(), QUANDO, 123456);
    const r = await c.vendi([KEBAB], 'contanti');
    expect(r.progressivo).toBe('DCW2026/9999-123457');
  });

  it('risposta persa → recuperato, senza doppioni', async () => {
    const c = new CassaProva(archivioInMemoria(), QUANDO);
    const r = await c.vendi([KEBAB], 'contanti', 'rete-dopo');
    expect(r.stato).toBe('recuperato');
    expect(c.simulatore.documenti).toHaveLength(1);
    expect(c.scontrini[0]!.recuperato).toBe(true);
  });

  it('rete assente → non emesso; sessione scaduta → niente emesso', async () => {
    const c = new CassaProva(archivioInMemoria(), QUANDO);
    await c.vendi([PATATE], 'contanti');
    await expect(c.vendi([KEBAB], 'contanti', 'rete-prima')).rejects.toBeInstanceOf(NonEmesso);
    await expect(c.vendi([KEBAB], 'contanti', 'sessione')).rejects.toBeInstanceOf(SessioneScaduta);
    expect(c.simulatore.documenti).toHaveLength(1);
    expect(await c.sospeso()).toBeNull();
  });

  it('verifica dopo un sospeso: recupera lo scontrino emesso', async () => {
    const a = archivioInMemoria();
    const c = new CassaProva(a, QUANDO);
    await c.vendi([KEBAB], 'contanti');
    // Vendita emessa ma risposta persa e verifica impossibile (rete giù anche dopo).
    c.simulatore.guasta('rete-dopo', 'rete-prima');
    await expect(c.vendi([PATATE], 'contanti')).rejects.toBeInstanceOf(InvioInSospeso);
    expect(await c.sospeso()).not.toBeNull();
    await expect(c.vendi([PATATE], 'contanti')).rejects.toBeInstanceOf(InvioInSospeso);
    const r = await c.verifica();
    expect(r?.stato).toBe('recuperato');
    expect(c.scontrini).toHaveLength(2);
    expect(c.scontrini[0]!.totale).toBe(5);
    expect(await c.verifica()).toBeNull();
  });

  it('annullo con risposta persa resta in sospeso e si chiude a mano', async () => {
    const c = new CassaProva(archivioInMemoria(), QUANDO);
    const r = await c.vendi([KEBAB], 'contanti');
    await expect(c.annulla(r.idtrx, 'rete-dopo')).rejects.toBeInstanceOf(InvioInSospeso);
    expect((await c.sospeso())?.tipo).toBe('A');
    await c.chiudiAMano();
    expect(await c.sospeso()).toBeNull();
  });

  it('totale senza errori di arrotondamento', () => {
    expect(totaleRighe([{ descrizione: 'x', quantita: 3, prezzo: 0.1, aliquota: '22' }])).toBe(0.3);
  });
});
