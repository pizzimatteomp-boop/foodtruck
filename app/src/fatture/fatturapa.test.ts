import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eNotaDiCredito, ErroreFattura, leggiFatturaPA } from './fatturapa';
import { figlio, leggiXml, testoDi, trova } from './xml';

const XML = readFileSync(resolve(__dirname, '../../tests/fatture/fattura-inventata.xml'), 'utf8');

describe('lettore XML', () => {
  it('elementi, testo, entità, CDATA, prefissi tolti, commenti e attributi ignorati', () => {
    const r = leggiXml('<?xml version="1.0"?><!-- c --><a:x k="v"><b>1 &amp; 2 &#233; &#x41;</b><c/><d><![CDATA[<ok>]]></d></a:x>');
    expect(r.figli[0]!.nome).toBe('x');
    expect(testoDi(r, 'x', 'b')).toBe('1 & 2 é A');
    expect(figlio(r, 'x', 'c')).toEqual({ nome: 'c', testo: '', figli: [] });
    expect(testoDi(r, 'x', 'd')).toBe('<ok>');
    expect(trova(r, 'd')?.nome).toBe('d');
    expect(trova(r, 'z')).toBeUndefined();
  });
  it('XML rotto: errore', () => {
    expect(() => leggiXml('<a><b></a>')).toThrow('chiusura');
    expect(() => leggiXml('<a><b>')).toThrow('non chiusi');
  });
});

describe('fattura elettronica', () => {
  const [f] = leggiFatturaPA(XML);

  it('fornitore, numero, data, totale', () => {
    expect(f).toMatchObject({
      fornitore: { nome: 'INGROSSO INVENTATO S.R.L. & C.', partitaIva: '99999999999', codiceFiscale: '' },
      tipo: 'TD01', numero: '1234/FD', data: '2026-10-12', totale: 39.41,
    });
    expect(eNotaDiCredito(f!)).toBe(false);
  });

  it('righe: codice del fornitore, prezzo effettivo con lo sconto, quantità 1 se manca', () => {
    expect(f!.righe).toEqual([
      { linea: 1, codice: 'CEC5', descrizione: 'CECI SECCHI SACCO 5 KG', quantita: 2, unita: 'PZ', prezzoUnitario: 10.5, prezzoTotale: 21, aliquotaIva: 10 },
      { linea: 2, codice: '', descrizione: 'TOVAGLIOLI 33X33 CONF. 500 PZ', quantita: 1, unita: 'CF', prezzoUnitario: 6.8, prezzoTotale: 6.8, aliquotaIva: 22 },
      { linea: 3, codice: '', descrizione: 'TRASPORTO', quantita: 1, unita: '', prezzoUnitario: 5, prezzoTotale: 5, aliquotaIva: 22 },
    ]);
  });

  it('più fatture nello stesso file; fornitore persona fisica; nota di credito', () => {
    const doppia = XML
      .replace('<Anagrafica><Denominazione>INGROSSO INVENTATO S.R.L. &amp; C.</Denominazione></Anagrafica>', '<Anagrafica><Nome>MARIO</Nome><Cognome>CONTADINO</Cognome></Anagrafica>')
      .replace('</FatturaElettronicaBody>', '</FatturaElettronicaBody><FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD04</TipoDocumento><Data>2026-10-20</Data><Numero>NC1</Numero><ImportoTotaleDocumento>-5,00</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali></FatturaElettronicaBody>');
    const r = leggiFatturaPA(doppia);
    expect(r).toHaveLength(2);
    expect(r[0]!.fornitore.nome).toBe('MARIO CONTADINO');
    expect(r[1]).toMatchObject({ tipo: 'TD04', numero: 'NC1', totale: -5, righe: [] });
    expect(eNotaDiCredito(r[1]!)).toBe(true);
  });

  it('file sbagliati: messaggi chiari', () => {
    expect(() => leggiFatturaPA('ciao <')).toThrow(ErroreFattura);
    expect(() => leggiFatturaPA('<a/>')).toThrow('non è una fattura');
    expect(() => leggiFatturaPA('<FatturaElettronica><FatturaElettronicaHeader/></FatturaElettronica>')).toThrow('contenuto');
    expect(() => leggiFatturaPA(XML.replace('<Data>2026-10-12</Data>', '<Data></Data>'))).toThrow('Data');
    const senzaNome = leggiFatturaPA(XML.replace('<Anagrafica><Denominazione>INGROSSO INVENTATO S.R.L. &amp; C.</Denominazione></Anagrafica>', '<Anagrafica/>'));
    expect(senzaNome[0]!.fornitore.nome).toBe('(fornitore senza nome)');
  });
});
