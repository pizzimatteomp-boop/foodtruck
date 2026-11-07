import { describe, expect, it } from 'vitest';
import { ErroreCassetto, elencoRicevute, giaPresente, perPortale, periodi, scaricaFattura, type FatturaCassetto } from './cassetto';
import { webNativo } from './nativo';
import { Traccia, type RichiestaWeb, type RispostaWeb } from './portale';

// Cassetto fiscale finto: dati inventati.
const F = (id: string, data: string, numero = `N${id}`) => ({ idFattura: id, tipoInvio: 'FPR', numeroFattura: numero, dataFattura: data, pivaEmittente: '11111111111', denominazioneEmittente: 'FORNITORE PROVA' });
function cassetto(o: { senzaToken?: boolean; elenco?: (dal: string, al: string) => unknown; file?: Partial<RispostaWeb> } = {}) {
  const viste: RichiestaWeb[] = [];
  const web = async (q: RichiestaWeb): Promise<RispostaWeb> => {
    viste.push(q);
    const u = new URL(q.url);
    if (u.pathname.endsWith('/tokenB2BCookie/get')) return { stato: 200, url: q.url, intestazioni: o.senzaToken ? {} : { 'x-b2bcookie': 'B', 'x-token': 'T' }, testo: '' };
    if (q.intestazioni?.['x-token'] !== 'T') return { stato: 409, url: q.url, intestazioni: {}, testo: '{}' };
    const m = /\/ricevute\/dal\/(\d{8})\/al\/(\d{8})\//.exec(u.pathname);
    if (m) return { stato: 200, url: q.url, intestazioni: {}, testo: JSON.stringify(o.elenco ? o.elenco(m[1]!, m[2]!) : { fatture: [] }) };
    if (u.pathname.includes('/rs/fatture/file/')) return { stato: 200, url: q.url, intestazioni: { 'Content-Disposition': 'attachment; filename=IT11111111111_ab1.xml.p7m' }, testo: '', byte: new Uint8Array([0x30, 0x80, 6, 9]), ...o.file };
    return { stato: 404, url: q.url, intestazioni: {}, testo: '' };
  };
  return { web, viste };
}

describe('cassetto fiscale', () => {
  it('periodi di al massimo 93 giorni, estremi compresi', () => {
    expect(periodi('2026-01-01', '2026-01-01')).toEqual([{ dal: '2026-01-01', al: '2026-01-01' }]);
    expect(periodi('2026-01-01', '2026-04-03')).toEqual([{ dal: '2026-01-01', al: '2026-04-03' }]);
    const anno = periodi('2026-01-01', '2026-12-31');
    expect(anno.map((p) => `${p.dal}/${p.al}`)).toEqual(['2026-01-01/2026-04-03', '2026-04-04/2026-07-05', '2026-07-06/2026-10-06', '2026-10-07/2026-12-31']);
    expect(periodi('2026-03-01', '2026-02-01')).toEqual([]);
    expect(perPortale('2026-11-07')).toBe('07112026');
  });

  it('elenco: tratti spezzati, doppioni tolti, voci strane scartate, in ordine di data', async () => {
    const { web, viste } = cassetto({ elenco: (dal) => ({ fatture: dal === '01012026' ? [F('12345678902', '2026-03-02'), F('12345678901', '2026-01-05'), { idFattura: 'x' }] : [F('12345678902', '2026-03-02'), F('12345678903', '2026-05-01')] }) });
    const e = await elencoRicevute(new Traccia(web), '2026-01-01', '2026-05-31');
    expect(e.map((f) => f.chiave)).toEqual(['FPR12345678901', 'FPR12345678902', 'FPR12345678903']);
    expect(e[0]).toEqual({ chiave: 'FPR12345678901', numero: 'N12345678901', data: '2026-01-05', partitaIva: '11111111111', fornitore: 'FORNITORE PROVA' });
    expect(viste.filter((v) => v.url.includes('/ricevute/')).map((v) => /dal\/(\d+)\/al\/(\d+)/.exec(v.url)!.slice(1).join('-'))).toEqual(['01012026-03042026', '04042026-31052026']);
  });

  it('errori chiari: senza codici, elenco non leggibile o non disponibile', async () => {
    await expect(elencoRicevute(new Traccia(cassetto({ senzaToken: true }).web), '2026-01-01', '2026-01-31')).rejects.toBeInstanceOf(ErroreCassetto);
    await expect(elencoRicevute(new Traccia(cassetto({ elenco: () => 'x' }).web), '2026-01-01', '2026-01-31')).rejects.toThrow(/non disponibile/);
    const rotto = cassetto();
    const t = new Traccia(async (q) => (q.url.includes('/ricevute/') ? { stato: 200, url: q.url, intestazioni: {}, testo: '<html>' } : rotto.web(q)));
    await expect(elencoRicevute(t, '2026-01-01', '2026-01-31')).rejects.toThrow(/non leggibile/);
  });

  it('riconosce le fatture già presenti', () => {
    const f: FatturaCassetto = { chiave: 'FPR1', numero: ' a/12 ', data: '2026-01-05', partitaIva: '11111111111', fornitore: 'X' };
    expect(giaPresente(f, [{ partitaIva: 'IT11111111111', numero: 'A/12', data: '2026-01-05' }])).toBe(true);
    expect(giaPresente(f, [{ numero: 'A/12', data: '2026-01-05' }])).toBe(true);
    expect(giaPresente(f, [{ partitaIva: '22222222222', numero: 'A/12', data: '2026-01-05' }])).toBe(false);
    expect(giaPresente(f, [{ partitaIva: '11111111111', numero: 'A/12', data: '2026-01-06' }])).toBe(false);
  });

  it('scarica il file in byte, con nome pulito; errori se manca', async () => {
    const f: FatturaCassetto = { chiave: 'FPR12345678901', numero: '1', data: '2026-01-05', partitaIva: '', fornitore: '' };
    const { web, viste } = cassetto();
    const t = new Traccia(web);
    expect(await scaricaFattura(t, f)).toEqual({ nome: 'IT11111111111_ab1.xml.p7m', byte: new Uint8Array([0x30, 0x80, 6, 9]) });
    const q = viste.at(-1)!;
    expect(q.binario).toBe(true);
    expect(q.url).toContain('/rs/fatture/file/FPR12345678901?tipoFile=FILE_FATTURA&download=1&v=');
    expect(t.testo()).toContain('4 byte');
    expect((await scaricaFattura(new Traccia(cassetto({ file: { intestazioni: {} } }).web), f)).nome).toBe('FPR12345678901.xml.p7m');
    await expect(scaricaFattura(new Traccia(cassetto({ file: { byte: new Uint8Array() } }).web), f)).rejects.toThrow(/non scaricato/);
    await expect(scaricaFattura(new Traccia(cassetto({ file: { stato: 500 } }).web), f)).rejects.toThrow(/500/);
  });

  it('il browser nativo restituisce i byte (base64 o già in byte)', async () => {
    const w = webNativo(async (o) => ({ status: 200, headers: {}, data: o.url.endsWith('a') ? btoa('\x30\x80') : o.url.endsWith('b') ? new Uint8Array([1]) : 5 }), 'UA');
    expect((await w({ url: 'https://x.it/a', metodo: 'GET', binario: true })).byte).toEqual(new Uint8Array([0x30, 0x80]));
    expect((await w({ url: 'https://x.it/b', metodo: 'GET', binario: true })).byte).toEqual(new Uint8Array([1]));
    expect((await w({ url: 'https://x.it/c', metodo: 'GET', binario: true })).byte).toEqual(new Uint8Array());
  });
});
