import { describe, expect, it } from 'vitest';
import { archivioSuDispositivo, emettiVendita, type MemoriaChiaveValore } from './emissione';
import { documentoVendita, type Cedente } from './dco';
import { ServizioDCO } from './servizio';
import { SimulatoreAgenzia } from './simulatore';

function memoria(): MemoriaChiaveValore & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, get: async ({ key }) => ({ value: m.get(key) ?? null }), set: async ({ key, value }) => { m.set(key, value); }, remove: async ({ key }) => { m.delete(key); } };
}

describe('archivio sul dispositivo', () => {
  it('salva, rilegge e toglie l\'invio in sospeso; ricorda l\'ultima emessa', async () => {
    const mem = memoria();
    const a = archivioSuDispositivo(mem);
    expect(await a.sospeso()).toBeNull();
    expect(await a.ultimaEmessa()).toBeNull();
    const x = { tipo: 'V' as const, impronta: { data: '07/11/2026', righe: [] }, idtrxPrecedente: null, creatoIl: '2026-11-07T10:00:00.000Z' };
    await a.salvaSospeso(x);
    expect(await archivioSuDispositivo(mem).sospeso()).toEqual(x);
    await a.togliSospeso();
    expect(await a.sospeso()).toBeNull();
    await a.salvaUltimaEmessa('123');
    expect(await a.ultimaEmessa()).toBe('123');
    expect([...mem.m.keys()]).toEqual(['vegman-dco-ultima']);
  });

  it('funziona con l\'emissione (simulatore)', async () => {
    const sim = new SimulatoreAgenzia();
    const mem = memoria();
    sim.guasta('rete-dopo');
    // Dati inventati.
    const cedente: Cedente = { partitaIva: '00000000000', codiceFiscale: 'XXXXXX00X00X000X', nome: 'PROVA', cognome: 'PROVA', indirizzo: 'VIA PROVA 1', cap: '00000', comune: 'PROVA', provincia: 'XX', nazione: 'IT' };
    const esempio = documentoVendita({ cedente, righe: [{ descrizione: 'Kebab', quantita: 1, prezzoLordo: 12, aliquotaIVA: '10' }], pagamenti: { contanti: 12 }, quando: new Date('2026-11-07T12:00:00Z') });
    const r = await emettiVendita(new ServizioDCO(sim), archivioSuDispositivo(mem), esempio);
    expect(r.stato).toBe('recuperato');
    expect(mem.m.get('vegman-dco-sospeso')).toBeUndefined();
  });
});
