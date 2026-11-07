import { describe, expect, it } from 'vitest';
import { BASE_DCO, leggiCorpo, trasportoNativo, type OpzioniHttp } from './nativo';
import { ServizioDCO } from './servizio';
import { ErroreRete, SessioneScaduta } from './trasporto';

describe('trasporto nativo', () => {
  it('compone indirizzo, intestazioni e corpo; legge il JSON', async () => {
    const viste: OpzioniHttp[] = [];
    const t = trasportoNativo(async (o) => { viste.push(o); return { status: 200, headers: { 'Content-Type': 'application/json' }, data: '{"esito":true,"idtrx":"1","progressivo":"P","errori":[]}' }; });
    const s = new ServizioDCO(t);
    expect(await s.invia({ a: 1 })).toEqual({ idtrx: '1', progressivo: 'P' });
    expect(viste[0]).toMatchObject({ url: `${BASE_DCO}doc/documenti/`, method: 'POST', data: { a: 1 }, responseType: 'json' });
    expect(viste[0]!.headers['Content-Type']).toBe('application/json');
  });

  it('GET senza corpo e senza Content-Type', async () => {
    let vista: OpzioniHttp | undefined;
    const t = trasportoNativo(async (o) => { vista = o; return { status: 200, headers: { 'content-type': 'application/json' }, data: { idtrx: '9' } }; });
    await t.invia({ metodo: 'GET', percorso: 'doc/documenti/ultimo/' });
    expect(vista && 'data' in vista).toBe(false);
    expect(vista!.headers['Content-Type']).toBeUndefined();
  });

  it('PDF in base64 → byte', async () => {
    const t = trasportoNativo(async (o) => {
      expect(o.responseType).toBe('arraybuffer');
      return { status: 200, headers: { 'content-type': 'application/pdf' }, data: btoa('%PDF-1') };
    });
    const pdf = await new ServizioDCO(t).pdf('5');
    expect(new TextDecoder().decode(pdf)).toBe('%PDF-1');
  });

  it('rinvio al login → sessione scaduta', async () => {
    const t = trasportoNativo(async () => ({ status: 200, headers: { 'content-type': 'text/html' }, data: '<html>', url: 'https://iampe.agenziaentrate.gov.it/sam/UI/Login?realm=x' }));
    await expect(new ServizioDCO(t).ultimaVendita()).rejects.toBeInstanceOf(SessioneScaduta);
    expect((await t.invia({ metodo: 'GET', percorso: 'x' })).urlFinale).toMatch(/Login/);
  });

  it('eccezione della rete → ErroreRete (anche senza messaggio)', async () => {
    await expect(trasportoNativo(async () => { throw new Error('timeout'); }).invia({ metodo: 'GET', percorso: 'x' })).rejects.toThrow(/timeout/);
    await expect(trasportoNativo(async () => { throw null; }).invia({ metodo: 'GET', percorso: 'x' })).rejects.toBeInstanceOf(ErroreRete);
  });

  it('senza intestazioni', async () => {
    const r = await trasportoNativo(async () => ({ status: 204, headers: undefined as never, data: '' })).invia({ metodo: 'GET', percorso: 'x' });
    expect(r).toEqual({ stato: 204, tipo: '', corpo: '' });
  });

  it('lettura del corpo nei vari casi', () => {
    const u = new Uint8Array([1, 2]);
    expect(leggiCorpo('application/pdf', u)).toBe(u);
    expect(leggiCorpo('application/pdf', u.buffer)).toEqual(u);
    expect(leggiCorpo('application/pdf', '%%%')).toBe('%%%');
    expect(leggiCorpo('application/pdf', 5)).toBe(5);
    expect(leggiCorpo('application/json', '')).toBeNull();
    expect(leggiCorpo('application/json', '{x')).toBe('{x');
    expect(leggiCorpo('text/plain', 'ciao')).toBe('ciao');
  });
});
