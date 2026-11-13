import { describe, expect, it } from 'vitest';
import { dataIso, eventiDalCalendario, eventiNuovi, importo, indirizzoValido, leggiCsv, paeseDaLuogo } from './calendario';

// Dati inventati, nella forma della scheda «App».
const CSV = [
  'Evento,Dal,Al,Luogo per la mappa,Fatturato previsto 2027,Incasso nel calendario 2026 (€)',
  'Fiera Uno,13/02/2027,14/02/2027,Forlì (FC),,"3.196 €"',
  '"Festa ""Due""",17/04/2027,18/04/2027,"Bologna, centro",5000,"5.900 €"',
  'Senza date,,,,,',
  'Monte Titano,08/05/2027,09/05/2027,San Marino (RSM),,',
  '',
].join('\r\n');

describe('eventi dal calendario', () => {
  it('legge il CSV con virgolette e virgole nelle celle', () => {
    const r = leggiCsv(CSV);
    expect(r).toHaveLength(5);
    expect(r[2]).toEqual(['Festa "Due"', '17/04/2027', '18/04/2027', 'Bologna, centro', '5000', '5.900 €']);
    expect(leggiCsv('a,"b\nc"\nd,e')).toEqual([['a', 'b\nc'], ['d', 'e']]);
  });

  it('date, importi e Paese', () => {
    expect(dataIso('13/02/2027')).toBe('2027-02-13');
    expect(dataIso('3/2/27')).toBe('2027-02-03');
    expect(dataIso('2027-2-3')).toBe('2027-02-03');
    expect(dataIso('31/13/2027')).toBeNull();
    expect(dataIso('domani')).toBeNull();
    expect(importo('3.196 €')).toBe(3196);
    expect(importo('€ 3.196,50')).toBe(3196.5);
    expect(importo('5000')).toBe(5000);
    expect(importo('')).toBe(0);
    expect(importo('n.d.')).toBe(0);
    expect(paeseDaLuogo('San Marino (RSM)')).toBe('SM');
    expect(paeseDaLuogo('Forlì (FC)')).toBe('IT');
  });

  it('eventi: colonne dal titolo, fatturato previsto o incasso dell\'anno scorso, righe senza date scartate', () => {
    const { eventi, scartate } = eventiDalCalendario(leggiCsv(CSV));
    expect(eventi).toEqual([
      { nome: 'Fiera Uno', dal: '2027-02-13', al: '2027-02-14', luogo: 'Forlì (FC)', paese: 'IT', fatturato: 3196 },
      { nome: 'Festa "Due"', dal: '2027-04-17', al: '2027-04-18', luogo: 'Bologna, centro', paese: 'IT', fatturato: 5000 },
      { nome: 'Monte Titano', dal: '2027-05-08', al: '2027-05-09', luogo: 'San Marino (RSM)', paese: 'SM', fatturato: 0 },
    ]);
    expect(scartate).toEqual(['Senza date: date mancanti o non leggibili']);
    expect(eventiDalCalendario([['Nome', 'Quando']]).scartate[0]).toMatch(/mancano le colonne/);
    expect(eventiDalCalendario([])).toEqual({ eventi: [], scartate: [] });
    expect(eventiDalCalendario([['Evento', 'Dal'], ['Solo', '01/06/2027'], ['Lungo'.repeat(30), '01/06/2027']]).eventi[0]).toMatchObject({ dal: '2027-06-01', al: '2027-06-01' });
  });

  it('solo i nuovi: stesso nome (senza maiuscole) e stesso primo giorno = già presente', () => {
    const { eventi } = eventiDalCalendario(leggiCsv(CSV));
    expect(eventiNuovi(eventi, [{ nome: 'FIERA UNO', dal: '2027-02-13' }]).map((e) => e.nome)).toEqual(['Festa "Due"', 'Monte Titano']);
    expect(eventiNuovi([...eventi, eventi[0]!], [])).toHaveLength(3);
  });

  it('indirizzo: solo Google Fogli pubblicato come CSV', () => {
    expect(indirizzoValido('https://docs.google.com/spreadsheets/d/e/2PACX-abc_1/pub?gid=12&single=true&output=csv')).toBe(true);
    expect(indirizzoValido('https://docs.google.com/spreadsheets/d/abc/edit')).toBe(false);
    expect(indirizzoValido('https://esempio.it/x.csv')).toBe(false);
  });
});
