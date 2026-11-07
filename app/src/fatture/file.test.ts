import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { leggiFatturaPA } from './fatturapa';
import { leggiFileFatture } from './file';
import { ErroreP7m, estraiXmlDaP7m, testoXml } from './p7m';
import { ErroreZip, leggiZip } from './zip';

const cartella = resolve(__dirname, '../../tests/fatture');
const leggi = (n: string) => new Uint8Array(readFileSync(resolve(cartella, n)));
const XML = readFileSync(resolve(cartella, 'fattura-inventata.xml'), 'utf8');

describe('fatture firmate .p7m (firmate con un certificato finto, solo per i test)', () => {
  it.each([
    'fattura-inventata.xml.p7m',
    'fattura-inventata-a-pezzi.xml.p7m',
    'fattura-inventata-a-pezzi-1000.xml.p7m',
    'fattura-inventata-base64.xml.p7m',
  ])('%s: l\'XML estratto è identico all\'originale', (nome) => {
    const xml = estraiXmlDaP7m(leggi(nome));
    expect(xml).toBe(XML);
    expect(leggiFatturaPA(xml)[0]!.numero).toBe('1234/FD');
  });

  it('file che non sono buste firmate', () => {
    expect(() => estraiXmlDaP7m(new TextEncoder().encode('ciao mondo'))).toThrow(ErroreP7m);
    expect(() => estraiXmlDaP7m(Uint8Array.from([0x30, 0x82, 0xff, 0xff, 0x01]))).toThrow(ErroreP7m);
    expect(() => estraiXmlDaP7m(Uint8Array.from([0x30, 0x03, 0x04, 0x01, 0x41]))).toThrow('non c\'è una fattura');
  });

  it('codifica dichiarata nell\'XML (ISO-8859-1)', () => {
    const latin = Uint8Array.from([...'<?xml version="1.0" encoding="ISO-8859-1"?><a>'].map((c) => c.charCodeAt(0)).concat([0xe8, ...[...'</a>'].map((c) => c.charCodeAt(0))]));
    expect(testoXml(latin)).toContain('<a>è</a>');
    expect(testoXml(new TextEncoder().encode('﻿<a/>'))).toBe('<a/>');
  });
});

describe('archivi ZIP', () => {
  it('compresso, con sottocartelle e file di servizio', async () => {
    const r = await leggiFileFatture('fatture-inventate.zip', leggi('fatture-inventate.zip'));
    expect(r.fatture.map((f) => f.nome)).toEqual(['IT99999999999_00001.xml', 'sottocartella/IT99999999999_00002.xml.p7m']);
    expect(r.fatture.every((f) => f.xml === XML)).toBe(true);
    expect(r.scartati).toEqual([{ nome: 'IT99999999999_00001_metaDato.xml', motivo: 'file di servizio del portale' }]);
  });

  it('non compresso', async () => {
    const f = await leggiZip(leggi('fatture-inventate-senza-compressione.zip'));
    expect(f).toHaveLength(1);
    expect(new TextDecoder().decode(f[0]!.dati)).toBe(XML);
  });

  it('ZIP rovinato o file sconosciuti: segnalati, senza bloccare gli altri', async () => {
    await expect(leggiZip(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0]))).rejects.toThrow(ErroreZip);
    const r = await leggiFileFatture('foto.jpg', Uint8Array.from([1, 2, 3]));
    expect(r.scartati[0]!.motivo).toContain('formato non riconosciuto');
    const x = await leggiFileFatture('altro.xml', new TextEncoder().encode('<a/>'));
    expect(x.scartati[0]!.motivo).toBe('non è una fattura elettronica');
    const rotto = await leggiFileFatture('rotto.zip', Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0]));
    expect(rotto.scartati[0]!.motivo).toContain('ZIP');
  });
});
