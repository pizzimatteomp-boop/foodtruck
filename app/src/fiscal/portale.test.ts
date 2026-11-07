import { describe, expect, it } from 'vitest';
import { webNativo, type OpzioniHttp } from './nativo';
import {
  AccessoRifiutato, accediPortale, compilaModulo, eLogin, ggmmaaaa, IVASERVIZI, leggiModulo, letturaDiProva, partitaIvaDa,
  PortaleCambiato, PORTALE, senzaParametri, Traccia, type RichiestaWeb, type RispostaWeb,
} from './portale';
import { ErroreRete } from './trasporto';

// Tutto inventato: nessuna credenziale vera, nessun portale vero.
const CRED = { codiceFiscale: 'XXXXXX00X00X000X', password: 'Segreta!123', pin: '9876543210' };
const SEGRETI = [CRED.codiceFiscale, CRED.password, CRED.pin, 'COOKIE-SEGRETO', 'TOKEN-SEGRETO', 'B2B-SEGRETO'];
const LOGIN = 'https://iampe.agenziaentrate.gov.it/sam/UI/Login?realm=/agenziaentrate&goto=aHR0cHM6Ly9wb3J0YWxl';
const MODULO = `<html><body><form name="Login" method="post" action="/sam/UI/Login?realm=/agenziaentrate">
  <input type="text" name="IDToken1" value=""><input type='password' name='IDToken2'><input type="password" name="IDToken3" />
  <input type="hidden" name="goto" value="aHR0cHM6Ly9wb3J0YWxl"><input type="hidden" name="gotoOnFail" value="">
  <input type="hidden" name="encoded" value="true"><input type="hidden" name="gx_charset" value="UTF-8">
  <input type="hidden" name="newpost" value="&quot;s&amp;i&#39;&#x41;"><input type="hidden" name="x_7f3" value="abc">
  <input type="submit" name="Login.Submit" value="Accedi"><input type="checkbox" name="ricorda" value="1"><input type="hidden" value="senza-nome">
</form><form><input name="q"></form></body></html>`;

type Opzioni = { rifiuta?: boolean; sceltaSoloModulo?: boolean; senzaModulo?: boolean; senzaToken?: boolean; sessionePersa?: boolean; erroreAccesso?: number; erroreScelta?: boolean };

function portaleFinto(o: Opzioni = {}) {
  const viste: RichiestaWeb[] = [];
  let dentro = false;
  let scelto = false;
  const r = (stato: number, url: string, testo = '', intestazioni: Record<string, string> = {}): RispostaWeb => ({ stato, url, intestazioni: { 'Content-Type': testo.startsWith('{') || testo.startsWith('[') ? 'application/json;charset=UTF-8' : 'text/html', 'Set-Cookie': 'S=COOKIE-SEGRETO', ...intestazioni }, testo });
  const web = async (q: RichiestaWeb): Promise<RispostaWeb> => {
    viste.push(q);
    const u = new URL(q.url);
    const p = u.pathname;
    if (p === '/portale/') return r(200, LOGIN, o.senzaModulo ? '<html>manutenzione</html>' : MODULO);
    if (p === '/sam/UI/Login' && q.metodo === 'POST') {
      if (o.erroreAccesso) return r(o.erroreAccesso, q.url, 'errore');
      const m = q.modulo!;
      const ok = !o.rifiuta && m.IDToken1 === CRED.codiceFiscale && m.IDToken2 === CRED.password && m.IDToken3 === CRED.pin && m.newpost === '"s&i\'A' && m.x_7f3 === 'abc';
      if (!ok) return r(200, LOGIN, MODULO);
      dentro = !o.sessionePersa;
      return r(200, `${PORTALE}/PortaleWeb/home`, '<html>home</html>');
    }
    if (!dentro) return r(200, LOGIN, MODULO);
    if (p === '/PortaleWeb/home') return r(200, `${IVASERVIZI}/instr/InstradamentofcWeb/home`, '<html>instr</html>');
    if (p.endsWith('/rs/initLight')) return r(200, q.url, '{"ok":true}');
    if (p.endsWith('/rs/infouser-fc')) return r(200, q.url, '{"utente":{"cf":"XXXXXX00X00X000X","nome":"PROVA"},"incarichi":[{"pIva":"11111111111"}]}');
    if (p.endsWith('/rs/wizardTemplate')) return r(200, q.url, '<div>scelta</div>');
    if (p.endsWith('/rs/setUserChoice')) {
      if (o.erroreScelta) return r(500, q.url, '');
      if (o.sceltaSoloModulo && !q.modulo) return r(415, q.url, '');
      const d = (q.modulo ?? q.json) as Record<string, string>;
      scelto = d.tipoutenza === 'meStesso' && d.pIva === '11111111111';
      return r(200, q.url, '{}');
    }
    if (p.endsWith('/rs/fullTemplate')) return r(scelto ? 200 : 406, q.url, '<div>home</div>');
    if (p.endsWith('/dati/fiscali')) return r(200, q.url, '{"partitaIva":"11111111111","denominazione":"PROVA"}');
    if (p.endsWith('/adesione/stato')) return r(200, q.url, '{"adesione":true,"revoca":false}');
    if (p.endsWith('/tokenB2BCookie/get')) return r(200, q.url, '', o.senzaToken ? {} : { 'x-b2bcookie': 'B2B-SEGRETO', 'X-Token': 'TOKEN-SEGRETO' });
    if (p.includes('/rs/fe/ricevute/')) {
      if (q.intestazioni?.['x-token'] !== 'TOKEN-SEGRETO') return r(409, q.url, '{}');
      return r(200, q.url, '{"totaleFatture":2,"fatture":[{"idFattura":"12345678901"},{"idFattura":"12345678902"}]}');
    }
    return r(404, q.url, '');
  };
  return { web, viste };
}

const nessunSegreto = (t: Traccia) => {
  const tutto = JSON.stringify(t.passi) + t.testo();
  for (const s of SEGRETI) expect(tutto).not.toContain(s);
};

describe('modulo di accesso', () => {
  it('trova il modulo giusto, decodifica i valori, compila senza pulsanti', () => {
    const m = leggiModulo(MODULO, LOGIN)!;
    expect(m.metodo).toBe('POST');
    expect(m.azione).toBe('https://iampe.agenziaentrate.gov.it/sam/UI/Login?realm=/agenziaentrate');
    expect(m.campi.find((x) => x.nome === 'newpost')!.valore).toBe('"s&i\'A');
    const d = compilaModulo(m, CRED);
    expect(Object.keys(d)).toEqual(['IDToken1', 'IDToken2', 'IDToken3', 'goto', 'gotoOnFail', 'encoded', 'gx_charset', 'newpost', 'x_7f3']);
    expect(d.IDToken3).toBe(CRED.pin);
    expect(leggiModulo('<form action="/x" method="get"><input name="IDToken1"></form>', 'https://a.it/b')).toEqual({ azione: 'https://a.it/x', metodo: 'GET', campi: [{ nome: 'IDToken1', valore: '', tipo: 'text' }] });
    expect(leggiModulo('<form><input name="IDToken1"></form>', 'non un indirizzo')).toBeNull();
    expect(leggiModulo('<html></html>', LOGIN)).toBeNull();
  });

  it('indirizzi senza parametri; pagina di accesso riconosciuta; data sul fuso di Roma', () => {
    expect(senzaParametri('https://a.it/x/y?cf=SEGRETO#z')).toBe('a.it/x/y');
    expect(senzaParametri('rotto')).toBe('?');
    expect(eLogin(LOGIN)).toBe(true);
    expect(eLogin(`${PORTALE}/PortaleWeb/home`)).toBe(false);
    expect(ggmmaaaa(new Date('2026-10-31T23:30:00Z'))).toBe('01112026');
  });

  it('partita IVA dalla risposta dell\'utente', () => {
    expect(partitaIvaDa('{"a":{"partitaIva":"12345678901"}}')).toBe('12345678901');
    expect(partitaIvaDa('{"piva":"123"}')).toBeUndefined();
    expect(partitaIvaDa('non json')).toBeUndefined();
  });
});

describe('accesso al portale (finto) e letture di prova', () => {
  it('accede, sceglie «Me stesso», legge: la traccia non contiene nessun valore', async () => {
    const { web, viste } = portaleFinto();
    const t = new Traccia(web);
    await accediPortale(t, CRED);
    const e = await letturaDiProva(t, new Date('2026-11-07T12:00:00Z'));
    expect(e).toEqual({ datiEsercente: true, fattureUltimi30Giorni: 2, adesione: true });
    expect(viste.find((v) => v.url.includes('/rs/fe/ricevute/'))!.url).toContain('/dal/08102026/al/07112026/ricerca/ricezione');
    expect(t.passi[0]!.nota).toBe('modulo POST → iampe.agenziaentrate.gov.it/sam/UI/Login; campi: goto(hidden), gotoOnFail(hidden), encoded(hidden), gx_charset(hidden), newpost(hidden), x_7f3(hidden), Login.Submit(submit), ricorda(checkbox)');
    expect(t.testo()).toContain('x-b2bcookie presente, x-token presente');
    expect(t.testo()).toContain('2 fatture');
    expect(t.testo()).toContain('chiavi: utente, incarichi');
    expect(t.testo()).toContain('→ ivaservizi.agenziaentrate.gov.it/instr/InstradamentofcWeb/home');
    nessunSegreto(t);
  });

  it('scelta dell\'utenza accettata solo come modulo: riprova in quel formato', async () => {
    const t = new Traccia(portaleFinto({ sceltaSoloModulo: true }).web);
    await accediPortale(t, CRED);
    expect(t.passi.map((p) => p.passo)).toContain('Scelta «Me stesso» (modulo)');
    nessunSegreto(t);
  });

  it('credenziali rifiutate: un solo tentativo, errore chiaro', async () => {
    const { web, viste } = portaleFinto({ rifiuta: true });
    const t = new Traccia(web);
    await expect(accediPortale(t, CRED)).rejects.toBeInstanceOf(AccessoRifiutato);
    expect(viste.filter((v) => v.metodo === 'POST')).toHaveLength(1);
    nessunSegreto(t);
  });

  it('portale cambiato: modulo assente, errore all\'invio, sessione non tenuta, scelta fallita', async () => {
    await expect(accediPortale(new Traccia(portaleFinto({ senzaModulo: true }).web), CRED)).rejects.toBeInstanceOf(PortaleCambiato);
    await expect(accediPortale(new Traccia(portaleFinto({ erroreAccesso: 500 }).web), CRED)).rejects.toThrow(/500/);
    await expect(accediPortale(new Traccia(portaleFinto({ sessionePersa: true }).web), CRED)).rejects.toThrow(/di nuovo le credenziali/);
    await expect(accediPortale(new Traccia(portaleFinto({ erroreScelta: true }).web), CRED)).rejects.toThrow(/Me stesso/);
  });

  it('senza codici per le fatture: elenco non chiesto; senza accesso: dati non letti', async () => {
    const f = portaleFinto({ senzaToken: true });
    const t = new Traccia(f.web);
    await accediPortale(t, CRED);
    expect((await letturaDiProva(t)).fattureUltimi30Giorni).toBeNull();
    expect(t.testo()).toContain('x-b2bcookie assente, x-token assente');
    const fuori = new Traccia(portaleFinto().web);
    expect(await letturaDiProva(fuori)).toEqual({ datiEsercente: false, fattureUltimi30Giorni: null, adesione: false });
  });

  it('risposte strane dell\'elenco: non JSON o senza fatture', async () => {
    const base = portaleFinto();
    for (const testo of ['non json', '{"x":1}', '[1,2]']) {
      const web = async (q: RichiestaWeb) => (q.url.includes('/rs/fe/ricevute/') ? { stato: 200, url: q.url, intestazioni: {}, testo } : base.web(q));
      const t = new Traccia(web);
      await accediPortale(t, CRED);
      expect((await letturaDiProva(t)).fattureUltimi30Giorni).toBeNull();
    }
  });

  it('rete giù: il passo è segnato e l\'errore risale', async () => {
    const t = new Traccia(async () => { throw new ErroreRete('giù'); });
    await expect(accediPortale(t, CRED)).rejects.toBeInstanceOf(ErroreRete);
    expect(t.passi).toEqual([{ passo: 'Pagina di accesso', metodo: 'GET', indirizzo: 'ivaservizi.agenziaentrate.gov.it/portale/', stato: 'rete' }]);
  });
});

describe('browser nativo', () => {
  it('moduli, JSON, rimandi, testo; errori di rete', async () => {
    const viste: OpzioniHttp[] = [];
    const w = webNativo(async (o) => { viste.push(o); return { status: 200, headers: { a: 'b' }, data: o.method === 'POST' ? { j: 1 } : 'ciao', url: 'https://fine.it/' }; }, 'UA-prova');
    expect(await w({ url: 'https://a.it/', metodo: 'POST', modulo: { x: '1' } })).toEqual({ stato: 200, url: 'https://fine.it/', intestazioni: { a: 'b' }, testo: '{"j":1}' });
    expect(viste[0]!.headers).toMatchObject({ 'User-Agent': 'UA-prova', 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(viste[0]!.data).toEqual({ x: '1' });
    await w({ url: 'https://a.it/', metodo: 'POST', json: { y: 2 }, intestazioni: { 'x-token': 't' } });
    expect(viste[1]!.headers).toMatchObject({ 'Content-Type': 'application/json', 'x-token': 't', Accept: expect.stringContaining('application/json') });
    expect((await w({ url: 'https://a.it/', metodo: 'GET' })).testo).toBe('ciao');
    expect('data' in viste[2]!).toBe(false);
    const senza = webNativo(async () => ({ status: 204, headers: undefined as never, data: undefined }), 'UA');
    expect(await senza({ url: 'https://b.it/', metodo: 'GET' })).toEqual({ stato: 204, url: 'https://b.it/', intestazioni: {}, testo: '""' });
    await expect(webNativo(async () => { throw new Error('timeout'); }, 'UA')({ url: 'https://a.it/', metodo: 'GET' })).rejects.toThrow(/timeout/);
    await expect(webNativo(async () => { throw null; }, 'UA')({ url: 'https://a.it/', metodo: 'GET' })).rejects.toBeInstanceOf(ErroreRete);
  });
});
