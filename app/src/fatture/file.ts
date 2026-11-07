/** Dai file caricati (XML, .p7m, ZIP anche annidati) ai testi XML delle fatture. */
import { estraiXmlDaP7m, testoXml } from './p7m';
import { eZip, leggiZip } from './zip';

export interface FileFattura { nome: string; xml: string }
export interface Lettura { fatture: FileFattura[]; scartati: { nome: string; motivo: string }[] }

export async function leggiFileFatture(nome: string, dati: Uint8Array, profondita = 0): Promise<Lettura> {
  const r: Lettura = { fatture: [], scartati: [] };
  const n = nome.toLowerCase();
  try {
    if (eZip(dati)) {
      if (profondita > 3) throw new Error('Troppi archivi uno dentro l\'altro.');
      for (const f of await leggiZip(dati)) {
        const sotto = await leggiFileFatture(f.nome, f.dati, profondita + 1);
        r.fatture.push(...sotto.fatture);
        r.scartati.push(...sotto.scartati);
      }
    } else if (n.endsWith('.p7m')) {
      r.fatture.push({ nome, xml: estraiXmlDaP7m(dati) });
    } else if (n.endsWith('.xml')) {
      const xml = testoXml(dati);
      if (xml.includes('FatturaElettronica')) r.fatture.push({ nome, xml });
      else r.scartati.push({ nome, motivo: n.includes('metadat') ? 'file di servizio del portale' : 'non è una fattura elettronica' });
    } else {
      r.scartati.push({ nome, motivo: 'formato non riconosciuto (servono .xml, .p7m o .zip)' });
    }
  } catch (e) {
    r.scartati.push({ nome, motivo: e instanceof Error ? e.message : 'file non leggibile' });
  }
  return r;
}
