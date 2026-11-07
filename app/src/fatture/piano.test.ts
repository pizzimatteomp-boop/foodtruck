import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Acquisto, Articolo } from '../foodcost/modello';
import { leggiFatturaPA } from './fatturapa';
import { idArticolo, idFattura, impronta, pianoFatture } from './piano';

const XML = readFileSync(resolve(__dirname, '../../tests/fatture/fattura-inventata.xml'), 'utf8');
const [F] = leggiFatturaPA(XML);
const nessuno = { fatture: new Set<string>(), acquisti: [] as Acquisto[], articoli: [] as Articolo[] };

describe('impronte stabili', () => {
  it('stesso testo → stesso codice, testi diversi → codici diversi', () => {
    expect(impronta('abc')).toBe(impronta('abc'));
    expect(impronta('abc')).not.toBe(impronta('abd'));
    expect(impronta('')).toMatch(/^[0-9a-f]{16}$/);
    expect(idFattura(F!)).toMatch(/^fat-[0-9a-f]{16}$/);
  });
  it('articolo: codice del fornitore se c\'è, altrimenti descrizione (spazi e maiuscole non contano)', () => {
    expect(idArticolo(F!.fornitore, 'cec5', 'qualsiasi')).toBe(idArticolo(F!.fornitore, 'CEC5', 'altra'));
    expect(idArticolo(F!.fornitore, '', 'Tovaglioli  33x33')).toBe(idArticolo(F!.fornitore, '', 'TOVAGLIOLI 33X33'));
    expect(idArticolo({ ...F!.fornitore, partitaIva: '11111111111' }, 'CEC5', '')).not.toBe(idArticolo(F!.fornitore, 'CEC5', ''));
  });
});

describe('piano di import delle fatture', () => {
  it('fattura nuova: righe come acquisti, articoli nuovi da controllare', () => {
    const p = pianoFatture([{ file: 'a.xml', fattura: F! }], nessuno);
    expect(p.fatture).toEqual([{ id: idFattura(F!), dati: {
      fornitore: 'INGROSSO INVENTATO S.R.L. & C.', partitaIva: '99999999999', tipo: 'TD01', numero: '1234/FD',
      data: '2026-10-12', totale: 39.41, righe: 3, file: 'a.xml',
    } }]);
    expect(p.acquisti.map((a) => [a.descrizione, a.quantita, a.prezzoUnitario])).toEqual([
      ['CECI SECCHI SACCO 5 KG', 2, 10.5], ['TOVAGLIOLI 33X33 CONF. 500 PZ', 1, 6.8], ['TRASPORTO', 1, 5],
    ]);
    expect(p.acquisti[0]).toMatchObject({ id: `${idFattura(F!)}-1`, origine: 'fattura', fattura: { numero: '1234/FD' } });
    expect(p.articoliNuovi.map((a) => [a.nome, a.categoria, a.ingrediente, a.codice])).toEqual([
      ['CECI SECCHI SACCO 5 KG', null, null, 'CEC5'], ['TOVAGLIOLI 33X33 CONF. 500 PZ', null, null, ''], ['TRASPORTO', null, null, ''],
    ]);
    expect(p.righeCollegate).toBe(0);
  });

  it('articolo già collegato: il prezzo si aggiorna da solo', () => {
    const ceci: Articolo = { id: idArticolo(F!.fornitore, 'CEC5', ''), nome: 'CECI', unita: 'PZ', categoria: 'alimentare', ingrediente: 'ceci', fattore: 5000 };
    const p = pianoFatture([{ file: 'a.xml', fattura: F! }], { ...nessuno, articoli: [ceci] });
    expect(p.righeCollegate).toBe(1);
    expect(p.articoliNuovi).toHaveLength(2);
    expect(p.acquisti[0]!.articolo).toBe(ceci.id);
  });

  it('nessun doppione: già caricata, due volte nello stesso caricamento, già in VegMan Planner', () => {
    expect(pianoFatture([{ file: 'a', fattura: F! }], { ...nessuno, fatture: new Set([idFattura(F!)]) }).saltate)
      .toEqual([{ fornitore: F!.fornitore.nome, numero: '1234/FD', motivo: 'già caricata' }]);
    const due = pianoFatture([{ file: 'a', fattura: F! }, { file: 'b', fattura: F! }], nessuno);
    expect(due.fatture).toHaveLength(1);
    expect(due.saltate[0]!.motivo).toBe('presente due volte nei file caricati');
    const planner: Acquisto = { id: 'x', data: '2026-10-12', fornitore: 'INGROSSO', descrizione: '', articolo: null, quantita: 1, unita: '', prezzoUnitario: 1, fattura: { numero: '1234/fd', id: 'p' }, origine: 'planner' };
    expect(pianoFatture([{ file: 'a', fattura: F! }], { ...nessuno, acquisti: [planner] }).saltate[0]!.motivo).toBe('già importata da VegMan Planner');
  });

  it('note di credito archiviate senza toccare i prezzi; righe a prezzo zero ignorate', () => {
    const nc = { ...F!, tipo: 'TD04', numero: 'NC1' };
    const p = pianoFatture([{ file: 'nc.xml', fattura: nc }], nessuno);
    expect(p.fatture).toHaveLength(1);
    expect(p.noteDiCredito).toBe(1);
    expect(p.acquisti).toHaveLength(0);
    const omaggio = { ...F!, numero: 'OM', righe: [{ ...F!.righe[0]!, prezzoTotale: 0 }] };
    expect(pianoFatture([{ file: 'o', fattura: omaggio }], nessuno).acquisti).toHaveLength(0);
  });
});
