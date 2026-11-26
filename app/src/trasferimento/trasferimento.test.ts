import { describe, expect, it } from 'vitest';
import { deserializza, leggiPacchetto, ORA_SERVER, preparaPacchetto, scritture, serializza } from './trasferimento';

// Dati inventati.
const ts = (ms: number) => ({ toMillis: () => ms });

describe('passaggio alla versione definitiva', () => {
  it('le date vanno e tornano', () => {
    const v = { a: 1, b: ts(1700000000000), c: [{ d: ts(5) }], e: null };
    const s = serializza(v);
    expect(s).toEqual({ a: 1, b: { __ts: 1700000000000 }, c: [{ d: { __ts: 5 } }], e: null });
    expect(deserializza(JSON.parse(JSON.stringify(s)), (ms) => `data:${ms}`)).toEqual({ a: 1, b: 'data:1700000000000', c: [{ d: 'data:5' }], e: null });
  });

  it('pacchetto: raccolte utili, solo eventi aperti non finiti e le loro previsioni', () => {
    const p = preparaPacchetto({
      raccolte: { ingredienti: [{ id: 'i1', nome: 'Ceci' }], menu: [{ id: 'pubblico', voci: [], aggiornatoDa: 'vecchio', aggiornatoIl: ts(1) }] },
      eventi: [
        { id: 'futuro', nome: 'Natale', dal: '2026-12-05', al: '2026-12-06', stato: 'aperto' },
        { id: 'passato', nome: 'Novembre', dal: '2026-11-20', al: '2026-11-22', stato: 'aperto' },
        { id: 'chiuso', nome: 'Chiuso', dal: '2026-12-10', al: '2026-12-10', stato: 'chiuso' },
      ],
      previsioni: [{ id: 'futuro', fatturato: 3000 }, { id: 'passato', fatturato: 1000 }],
    }, '2026-11-26', '2026-11-26T10:00:00Z');
    expect(p.raccolte.eventi!.map((e) => e.id)).toEqual(['futuro']);
    expect(p.raccolte.previsioni!.map((e) => e.id)).toEqual(['futuro']);
    expect(p.raccolte.menu![0]!.aggiornatoIl).toEqual({ __ts: 1 });
    expect(leggiPacchetto(JSON.stringify(p))).toEqual(p);
    expect(() => leggiPacchetto('ciao')).toThrow('non è un file di dati VegMan');
    expect(() => leggiPacchetto('{"vegman":9,"raccolte":{}}')).toThrow('altra versione');
  });

  it('scritture: firma e ora rifatte col titolare nuovo; fatture e storico già presenti saltati', () => {
    const p = preparaPacchetto({
      raccolte: {
        fatture: [{ id: 'f1', numero: '1' }, { id: 'f2', numero: '2' }],
        storico: [{ id: '2026-10', mese: '2026-10', creatoDa: 'vecchio', creatoIl: ts(1) }],
        menu: [{ id: 'pubblico', voci: [], aggiornatoDa: 'vecchio', aggiornatoIl: ts(1) }],
        acquisti: [{ id: 'a1', data: '2026-10-01', quando: ts(42) }],
      }, eventi: [], previsioni: [],
    }, '2026-11-26', 'x');
    const r = scritture(JSON.parse(JSON.stringify(p)), 'nuovo', new Set(['fatture/f1']), (ms) => `data:${ms}`);
    expect(r.saltati).toBe(1);
    expect(r.scritture.map((s) => s.percorso)).toEqual(['fatture/f2', 'storico/2026-10', 'menu/pubblico', 'acquisti/a1']);
    expect(r.scritture[1]!.dati).toEqual({ mese: '2026-10', creatoDa: 'nuovo', creatoIl: ORA_SERVER });
    expect(r.scritture[2]!.dati).toEqual({ voci: [], aggiornatoDa: 'nuovo', aggiornatoIl: ORA_SERVER });
    expect(r.scritture[3]!.dati).toEqual({ data: '2026-10-01', quando: 'data:42' });
    expect(r.conti).toEqual({ fatture: 1, storico: 1, menu: 1, acquisti: 1 });
  });
});

describe('blocchi di scrittura', () => {
  it('al massimo N documenti e un peso massimo per blocco', async () => {
    const { blocchi } = await import('./trasferimento.db');
    const s = Array.from({ length: 5 }, (_, i) => ({ dati: { x: 'a'.repeat(i === 2 ? 50 : 5) } }));
    expect(blocchi(s, 2, 1000).map((b) => b.length)).toEqual([2, 2, 1]);
    expect(blocchi(s, 10, 60).map((b) => b.length)).toEqual([2, 1, 2]);
    expect(blocchi([], 2, 10)).toEqual([]);
  });
});
