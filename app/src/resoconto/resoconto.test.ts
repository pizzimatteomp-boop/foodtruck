import { describe, expect, it } from 'vitest';
import { scontrinoAnnullo, scontrinoVendita, type ScontrinoArchivio } from '../cassa/archivio';
import { preparaMovimenti } from '../cassa/movimenti';
import { resoconto, type Costi } from './resoconto';

const K = { prodotto: 'k', descrizione: 'Kebab', quantita: 1, centesimi: 1200, aliquota: '10' as const };
const P = { prodotto: 'p', descrizione: 'Patate', quantita: 1, centesimi: 500, aliquota: '10' as const };
const COSTI: Costi = new Map([['k', { costo: 3.3, completo: true, nome: 'Kebab' }], ['p', { costo: 1, completo: false, nome: 'Patate' }]]);
const v = (id: string, righe: typeof K[], pagamento: 'contanti' | 'elettronico', o: Partial<{ cassa: string; giorno: string; ambiente: 'simulatore' | 'agenzia' }> = {}) =>
  scontrinoVendita({ idtrx: id, progressivo: `P${id}`, righe, pagamento, ambiente: o.ambiente ?? 'agenzia', cassa: o.cassa ?? 'Furgone', giorno: o.giorno ?? '2026-11-14', evento: 'ev1' });

describe('resoconto dell\'evento', () => {
  it('incassi, prodotti, senza incasso, margine e food cost; annullati e scontrini di prova esclusi', () => {
    const a = v('1', [{ ...K, quantita: 2 }, P], 'contanti');
    const b = v('2', [K, { descrizione: 'Varie', quantita: 1, centesimi: 300, aliquota: '22' } as never], 'elettronico', { cassa: 'Cassa 2', giorno: '2026-11-15' });
    const sbagliato = v('3', [K], 'contanti');
    const annullo = scontrinoAnnullo(sbagliato, { idtrx: '4', progressivo: 'P4', cassa: 'Furgone', giorno: '2026-11-14' });
    const prova = v('5', [K], 'contanti', { ambiente: 'simulatore' });
    const mov = [
      ...preparaMovimenti([{ ...K, quantita: 2 }], { tipo: 'pasto_staff', motivo: 'pranzo', evento: 'ev1', cassa: 'Furgone', giorno: '2026-11-14', gruppo: 'g' }),
      ...preparaMovimenti([P], { tipo: 'scarto', motivo: 'caduto', evento: 'ev1', cassa: 'Furgone', giorno: '2026-11-14', gruppo: 'h' }),
    ];
    const r = resoconto([a, b, sbagliato, annullo, prova], mov, COSTI);
    expect(r).toMatchObject({ prova: false, scontrini: 2, annullati: 1, contanti: 2900, carta: 1500, incasso: 4400, medio: 2200 });
    // netto: 3600/1,1 = 3273 (kebab ×3) + 500/1,1 = 455 + 300/1,22 = 246
    expect(r.netto).toBe(3273 + 455 + 246);
    expect(r.prodotti.map((x) => [x.nome, x.pezzi, x.incasso, x.costo])).toEqual([
      ['Kebab', 3, 3600, 990], ['Patate', 1, 500, 100], ['Importi liberi', 1, 300, null],
    ]);
    expect(r.perGiorno).toEqual([{ giorno: '2026-11-14', incasso: 2900, scontrini: 1 }, { giorno: '2026-11-15', incasso: 1500, scontrini: 1 }]);
    expect(r.perCassa[0]).toEqual({ cassa: 'Furgone', incasso: 2900, scontrini: 1 });
    expect(r.senzaIncasso).toEqual([
      { tipo: 'pasto_staff', nome: 'Pasto staff', pezzi: 2, costo: 660, dettaglio: '2× Kebab' },
      { tipo: 'scarto', nome: 'Scarto', pezzi: 1, costo: 100, dettaglio: '1× Patate' },
    ]);
    expect(r.costoVenduto).toBe(1090);
    expect(r.costoSenzaIncasso).toBe(760);
    expect(r.margine).toBe(3974 - 1090 - 760);
    expect(r.foodCost).toBe(27.4);
    expect(r.incompleti).toEqual(['Patate']);
  });

  it('solo scontrini di prova: si dice; evento vuoto', () => {
    const r = resoconto([v('1', [K], 'contanti', { ambiente: 'simulatore' })], [], COSTI);
    expect(r).toMatchObject({ prova: true, scontrini: 1, incasso: 1200 });
    const vuoto = resoconto([], [], COSTI);
    expect(vuoto).toMatchObject({ prova: false, scontrini: 0, medio: 0, foodCost: null, prodotti: [], senzaIncasso: [] });
  });

  it('prodotto non più nel listino: nome dallo scontrino, senza costo', () => {
    const s: ScontrinoArchivio = v('1', [{ ...K, prodotto: 'vecchio', descrizione: 'Panino vecchio' }], 'contanti');
    const r = resoconto([s], [], COSTI);
    expect(r.prodotti[0]).toMatchObject({ nome: 'Panino vecchio', costo: null });
    expect(r.costoVenduto).toBe(0);
  });
});
