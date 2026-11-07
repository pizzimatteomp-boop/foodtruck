import type { Ingrediente } from '../foodcost/modello';
import { ErroreAcquisto, preparaAcquistoManuale } from './manuale';

const pomodoro: Ingrediente = { id: 'pom', nome: 'Pomodoro', categoria: 'alimentare', unita: 'g', gruppo: '', confezione: null };

describe('acquisto manuale', () => {
  it('pomodoro dal contadino: 3 kg per 5,40 € → 0,0018 €/g, articolo già collegato', () => {
    const r = preparaAcquistoManuale({ data: '2026-11-02', fornitore: ' Contadino Rossi ', quantita: '3000', totale: '5,40' }, pomodoro, '2026-11-07');
    expect(r.articolo).toEqual({ id: r.articolo.id, nome: 'Pomodoro (Contadino Rossi)', unita: 'g', categoria: 'alimentare', ingrediente: 'pom', fattore: 1, fornitore: 'Contadino Rossi' });
    expect(r.acquisto).toMatchObject({ data: '2026-11-02', fornitore: 'Contadino Rossi', articolo: r.articolo.id, quantita: 3000, unita: 'g', fattura: null, origine: 'manuale', descrizione: 'Acquisto a mano: Pomodoro' });
    expect(r.acquisto.prezzoUnitario).toBeCloseTo(0.0018, 10);
    // stesso fornitore e ingrediente → stesso articolo
    expect(preparaAcquistoManuale({ data: '2026-11-03', fornitore: 'contadino rossi', quantita: 1, totale: 2 }, pomodoro, '2026-11-07').articolo.id).toBe(r.articolo.id);
  });

  it('errori chiari', () => {
    const ok = { data: '2026-11-02', fornitore: 'X', quantita: 1, totale: 1 };
    expect(() => preparaAcquistoManuale({ ...ok, fornitore: '' }, pomodoro, '2026-11-07')).toThrow('da chi');
    expect(() => preparaAcquistoManuale({ ...ok, data: '2/11' }, pomodoro, '2026-11-07')).toThrow('Data');
    expect(() => preparaAcquistoManuale({ ...ok, data: '2026-12-01' }, pomodoro, '2026-11-07')).toThrow('futuro');
    expect(() => preparaAcquistoManuale({ ...ok, quantita: 0 }, pomodoro, '2026-11-07')).toThrow('quantità in g');
    expect(() => preparaAcquistoManuale({ ...ok, totale: 'x' }, pomodoro, '2026-11-07')).toThrow(ErroreAcquisto);
  });
});
