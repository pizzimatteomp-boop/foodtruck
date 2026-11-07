import { describe, expect, it } from 'vitest';
import { webNativo, type OpzioniHttp } from './nativo';
import {
  AccessoRifiutato, accediPortale, codiceErrore, eLogin, ggmmaaaa, IVASERVIZI, letturaDiProva, partitaIvaDa,
  Interrotta, messaggioSicuro, PortaleCambiato, PORTALE, apriPagina, decodifica, pontePagina, senzaParametri, strutturaPagina, Traccia, type RichiestaWeb, type RispostaWeb,
} from './portale';
import { ErroreRete } from './trasporto';

// Tutto inventato: nessuna credenziale vera, nessun portale vero.
const CRED = { codiceFiscale: 'XXXXXX00X00X000X', password: 'Segreta!123', pin: '9876543210' };
const SEGRETI = [CRED.codiceFiscale, CRED.password, CRED.pin, 'COOKIE-SEGRETO', 'TOKEN-SEGRETO', 'B2B-SEGRETO', 'LARES-SEGRETO', 'PAPPL-SEGRETO', 'IAPPL-SEGRETO'];
const LOGIN = `https://iampe.agenziaentrate.gov.it/sam/UI/Login?realm=/agenziaentrate&goto=${encodeURIComponent('https://portale.agenziaentrate.gov.it/PortaleWeb/home?to=FATBTB')}`;
const SPA = '<!doctype html><html><head><title>Agenzia delle Entrate - Area riservata</title></head><body><script defer src="/loginam/dist/js/app.bundle.min.js"></script></body><div id="root"></div></html>';

type Opzioni = { senzaRed?: boolean; vaiKo?: boolean; rifiuta?: string; sceltaSoloModulo?: boolean; altraPagina?: boolean; senzaToken?: boolean; sessionePersa?: boolean; erroreAccesso?: number; erroreScelta?: boolean };

function portaleFinto(o: Opzioni = {}) {
  const viste: RichiestaWeb[] = [];
  let dentro = false;
  let dentroIva = false;
  let scelto = false;
  const r = (stato: number, url: string, testo = '', intestazioni: Record<string, string> = {}): RispostaWeb => ({ stato, url, intestazioni: { 'Content-Type': testo.startsWith('{') || testo.startsWith('[') ? 'application/json;charset=UTF-8' : 'text/html', 'Set-Cookie': 'S=COOKIE-SEGRETO', ...intestazioni }, testo });
  const web = async (q: RichiestaWeb): Promise<RispostaWeb> => {
    viste.push(q);
    const u = new URL(q.url);
    const p = u.pathname;
    if (p === '/portale/') return o.altraPagina ? r(200, 'https://www.agenziaentrate.gov.it/manutenzione', '<html><title>Manutenzione</title></html>') : r(200, LOGIN, SPA);
    if (p === '/api/login/telematico' && q.metodo === 'POST') {
      if (o.erroreAccesso) return r(o.erroreAccesso, q.url, 'errore');
      const m = q.json as Record<string, string>;
      if (q.intestazioni?.Origin !== 'https://iampe.agenziaentrate.gov.it') return r(403, q.url, '{}');
      if (o.rifiuta) return r(401, q.url, o.rifiuta === 'non-json' ? 'no' : `{"details":"${o.rifiuta}"}`);
      if (m.username !== CRED.codiceFiscale || m.password !== CRED.password || m.pin !== CRED.pin) return r(401, q.url, '{"details":"INVALID_CREDENTIALS"}');
      dentro = !o.sessionePersa;
      return r(200, q.url, '{"ok":true}');
    }
    if (!dentro) return r(200, LOGIN, SPA);
    // Come il portale (dal suo codice): initPortale → x-red (o vaiAFatturazione) → pagina ponte che apre la sessione su ivaservizi.
    if (p === '/PortaleWeb/home') return r(200, q.url, '<html><title>Agenzia delle Entrate - Area riservata</title><div id="root"></div></html>');
    if (p === '/portale-rest/rs/initPortale') {
      if (!u.search.includes('to=FATBTB')) return r(200, q.url, '{}');
      return o.senzaRed ? r(200, q.url, '{"utente":"x"}', { 'x-appl': 'PAPPL-SEGRETO' }) : r(501, q.url, '', { 'x-red': `${IVASERVIZI}/agent/cdsso?tk=LARES-SEGRETO`, 'x-appl': 'PAPPL-SEGRETO' });
    }
    if (p === '/portale-rest/rs/servizi/vaiAFatturazione/b2b') {
      if (q.intestazioni?.['x-appl'] !== 'PAPPL-SEGRETO') return r(403, q.url, '');
      return r(200, q.url, o.vaiKo ? '{"esito":"KO","messaggio":"no"}' : `{"esito":"OK","url":"${IVASERVIZI}/agent/cdsso?tk=LARES-SEGRETO"}`);
    }
    if (p === '/agent/cdsso' && q.metodo === 'GET') return r(200, q.url, `<html><body onload="document.forms[0].submit()"><form method="post" action="/agent/cdsso"><input type="hidden" name="LARES" value="LARES&#x2D;SEGRETO"><input type="submit" value="Continua"></form></body></html>`);
    if (p === '/agent/cdsso' && q.metodo === 'POST') { dentroIva = q.modulo?.LARES === 'LARES-SEGRETO'; return r(200, q.url, '<html><head><meta http-equiv="refresh" content="0;url=/instr/InstradamentofcWeb/home"></head></html>'); }
    if (p === '/instr/InstradamentofcWeb/home') return r(200, q.url, '<html><title>Fatture e Corrispettivi</title></html>');
    if (!dentroIva) return r(403, q.url, 'Error 403: AuthenticationFailed');
    if (p.endsWith('/rs/initLight')) return r(200, q.url, '{"ok":true}', { 'x-appl': 'IAPPL-SEGRETO' });
    if (p === '/dp/PI2FC') return r(200, q.url, '<html><title>Servizi</title></html>');
    if (p.startsWith('/instr/instradamento-fatture-rest/') && q.intestazioni?.['x-appl'] !== 'IAPPL-SEGRETO') return r(403, q.url, 'Error 403: AuthenticationFailed');
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

describe('pagine ponte', () => {
  const B = 'https://portale.agenziaentrate.gov.it/x';
  it('modulo automatico, meta refresh, script; solo siti dell\'Agenzia', () => {
    expect(pontePagina('<body onload="x()"><form action="https://ivaservizi.agenziaentrate.gov.it/a?b=1&amp;c=2"><input name="k" value="v&#43;&quot;&#x41;&lt;&nbsp;"><input type="submit" name="s"><input value="senza"></form>', B))
      .toEqual({ tipo: 'modulo', url: 'https://ivaservizi.agenziaentrate.gov.it/a?b=1&c=2', metodo: 'GET', campi: { k: 'v+"A<&nbsp;' } });
    expect(pontePagina('<script>document.forms[0].submit()</script><form method="POST"></form>', B)).toEqual({ tipo: 'modulo', url: B, metodo: 'POST', campi: {} });
    expect(pontePagina('<body onload="x()"><form action="https://cattivo.it/"></form>', B)).toBeNull();
    expect(pontePagina('<body onload="x()">niente</body>', B)).toBeNull();
    expect(pontePagina('<meta http-equiv="Refresh" content="0; URL=/y">', B)).toEqual({ tipo: 'meta', url: 'https://portale.agenziaentrate.gov.it/y', metodo: 'GET', campi: {} });
    expect(pontePagina('<meta http-equiv="refresh" content="0;url=https://cattivo.it/">', B)).toBeNull();
    expect(pontePagina('<script>window.location.href = "https://ivaservizi.agenziaentrate.gov.it/z"</script>', B)?.url).toBe('https://ivaservizi.agenziaentrate.gov.it/z');
    expect(pontePagina("<script>location.replace('/w')</script>", B)?.tipo).toBe('script');
    expect(pontePagina("<script>location='http://[rotto'</script>", B)).toBeNull();
    expect(pontePagina('<html>normale</html>', B)).toBeNull();
    expect(decodifica('&amp;&#65;&#x42;&zzz;')).toBe('&AB&zzz;');
  });

  it('una catena di ponti si ferma a 6', async () => {
    let n = 0;
    const t = new Traccia(async (q) => { n++; return { stato: 200, url: q.url, intestazioni: { 'content-type': 'text/html' }, testo: '<meta http-equiv="refresh" content="0;url=/ancora">' }; });
    await apriPagina(t, 'Giro', 'https://portale.agenziaentrate.gov.it/inizio');
    expect(n).toBe(7);
  });
});

describe('accesso: pezzi', () => {
  it('codice d\'errore, indirizzi senza parametri, pagina di accesso, data di Roma', () => {
    expect(codiceErrore('{"details":"PASSWORD_EXPIRED"}')).toBe('PASSWORD_EXPIRED');
    expect(codiceErrore('{"details":"<script>"}')).toBeUndefined();
    expect(codiceErrore('no')).toBeUndefined();
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

describe('descrizione della pagina senza modulo', () => {
  it('struttura senza valori', () => {
    const html = `<html><head><title> Accesso
      ai servizi </title><script src="/sam/XUI/main.js"></script><script src="https://cdn.x.it/lib.js?v=1"></script><script>var a='SEGRETO';</script></head>
      <body><form id="f1" method="post" action="/sam/json/authenticate?x=1"><input type="hidden" name="authId" value="SEGRETO"><button id="vai">Vai</button></form>
      <form action="javascript:void(0)"></form><form action="http://[rotto"></form><form></form>
      <iframe src="/fisconline/login.jsp"></iframe><a href="/sam/UI/Login?service=fisconline&k=SEGRETO">Fisconline</a><a href="https://spid.it/x">SPID</a><a href="/altro">x</a>
      <input value="senza nome"><noscript>js</noscript> callbacks SPID</body></html>`;
    const d = strutturaPagina(html, 'https://iampe.agenziaentrate.gov.it/sam/UI/Login?realm=x');
    expect(d).not.toContain('SEGRETO');
    expect(d).toContain('titolo «Accesso ai servizi»');
    expect(d).toContain('moduli: POST /sam/json/authenticate (f1) | GET javascript | GET ? | GET -');
    expect(d).toContain('campi: authId(hidden), #vai(button)');
    expect(d).toContain('script: /sam/XUI/main.js, cdn.x.it/lib.js + 1 interni');
    expect(d).toContain('cornici: /fisconline/login.jsp');
    expect(d).toContain('collegamenti di accesso: /sam/UI/Login, spid.it/x');
    expect(d).toContain('contiene: Fisconline, SPID, XUI, json/authenticate, authId, callbacks, noscript');
    expect(strutturaPagina('', 'https://a.it/')).toBe('pagina 0 caratteri, titolo «-»; moduli: nessuno; campi: nessuno; script: nessuno + 0 interni; collegamenti di accesso: nessuno; contiene: nessuna parola chiave');
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
    expect(viste[1]).toMatchObject({ metodo: 'POST', url: 'https://iampe.agenziaentrate.gov.it/api/login/telematico' });
    expect(viste[2]!.url).toBe('https://portale.agenziaentrate.gov.it/PortaleWeb/home?to=FATBTB');
    expect(t.testo()).toContain('ponte (modulo) → ivaservizi.agenziaentrate.gov.it/agent/cdsso; campi: LARES');
    expect(t.testo()).toContain('Fatture e Corrispettivi · ponte 1 · POST ivaservizi.agenziaentrate.gov.it/agent/cdsso → 200 [text/html] · ponte (meta) → ivaservizi.agenziaentrate.gov.it/instr/InstradamentofcWeb/home');
    expect(t.testo()).toContain('titolo «Fatture e Corrispettivi», nessun rimando nella pagina');
    expect(t.testo()).toContain('2. Invio credenziali · POST iampe.agenziaentrate.gov.it/api/login/telematico → 200 [application/json] · chiavi: ok');
    expect(t.testo()).toContain('x-b2bcookie presente, x-token presente');
    expect(t.testo()).toContain('2 fatture');
    expect(t.testo()).toContain('chiavi: utente, incarichi');
    expect(t.testo()).toContain('→ ivaservizi.agenziaentrate.gov.it/instr/InstradamentofcWeb/home');
    nessunSegreto(t);
  });

  it('senza x-red si passa da vaiAFatturazione; con esito KO si prova l\'ingresso diretto; /dp/PI2FC che non risponde non blocca', async () => {
    const a = portaleFinto({ senzaRed: true });
    const ta = new Traccia(a.web);
    await accediPortale(ta, CRED);
    expect(ta.testo()).toContain('Vai a Fatture e Corrispettivi · GET portale.agenziaentrate.gov.it/portale-rest/rs/servizi/vaiAFatturazione/b2b → 200 [application/json] · esito: OK → ivaservizi.agenziaentrate.gov.it/agent/cdsso');
    expect(ta.testo()).toContain('x-appl presente; chiavi: utente');
    nessunSegreto(ta);
    const b = portaleFinto({ senzaRed: true, vaiKo: true });
    const tb = new Traccia(async (q) => { if (q.url.includes('/dp/PI2FC')) throw new ErroreRete('giù'); return b.web(q); });
    await expect(accediPortale(tb, CRED)).rejects.toThrow(/Me stesso/);
    expect(tb.testo()).toContain('esito: KO');
    expect(tb.testo()).toContain('Servizi IVA (PI2FC) · GET ivaservizi.agenziaentrate.gov.it/dp/PI2FC → rete');
    expect(tb.testo()).toContain('initLight → 403');
    const c = new Traccia(async (q) => (q.url.includes('vaiAFatturazione') ? { stato: 200, url: q.url, intestazioni: {}, testo: 'non json' } : a.web(q)));
    await accediPortale(c, CRED).catch(() => undefined);
    expect(c.testo()).toContain('vaiAFatturazione/b2b → 200');
  });

  it('scelta dell\'utenza accettata solo come modulo: riprova in quel formato', async () => {
    const t = new Traccia(portaleFinto({ sceltaSoloModulo: true }).web);
    await accediPortale(t, CRED);
    expect(t.passi.map((p) => p.passo)).toContain('Scelta «Me stesso» (modulo)');
    nessunSegreto(t);
  });

  it('credenziali rifiutate: un solo tentativo, motivo chiaro', async () => {
    for (const [codice, testo] of [['INVALID_CREDENTIALS', 'credenziali errate'], ['PASSWORD_EXPIRED', 'password scaduta'], ['ACCOUNT_LOCKED', 'utenza bloccata'], ['FAILED_LOGIN_ATTEMPTS', 'troppi tentativi'], ['ALTRO_CODICE', 'ALTRO_CODICE'], ['non-json', 'risposta 401']] as const) {
      const { web, viste } = portaleFinto({ rifiuta: codice });
      const t = new Traccia(web);
      const e = await accediPortale(t, CRED).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(AccessoRifiutato);
      expect((e as Error).message).toContain(testo);
      expect(viste.filter((v) => v.metodo === 'POST')).toHaveLength(1);
      if (codice !== 'non-json') expect(t.testo()).toContain(`esito: ${codice}`);
      nessunSegreto(t);
    }
  });

  it('se la pagina di accesso porta altrove, verso Fatture e Corrispettivi si va comunque', async () => {
    const base = portaleFinto();
    const web = async (q: RichiestaWeb) => (q.url.endsWith('/portale/') ? { stato: 200, url: 'https://iampe.agenziaentrate.gov.it/sam/UI/Login?realm=/agenziaentrate', intestazioni: {}, testo: SPA } : base.web(q));
    const t = new Traccia(web);
    await accediPortale(t, CRED);
    expect(base.viste.filter((v) => v.url.includes('PortaleWeb/home'))).toHaveLength(1);
  });

  it('portale cambiato: modulo assente, errore all\'invio, sessione non tenuta, scelta fallita', async () => {
    const senza = new Traccia(portaleFinto({ altraPagina: true }).web);
    await expect(accediPortale(senza, CRED)).rejects.toBeInstanceOf(PortaleCambiato);
    expect(senza.testo()).toContain('titolo «Manutenzione»');
    await expect(accediPortale(new Traccia(portaleFinto({ erroreAccesso: 404 }).web), CRED)).rejects.toThrow(/404/);
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
    expect(t.passi).toEqual([{ passo: 'Pagina di accesso', metodo: 'GET', indirizzo: 'ivaservizi.agenziaentrate.gov.it/portale/', stato: 'rete', nota: 'errore: giù' }]);
  });

  it('avanzamento passo per passo e interruzione', async () => {
    const t = new Traccia(portaleFinto().web);
    const visti: string[] = [];
    t.alPasso = (p) => { visti.push(`${p.passo}:${p.stato}`); if (visti.length === 2) t.interrotta = true; };
    await expect(accediPortale(t, CRED)).rejects.toBeInstanceOf(Interrotta);
    expect(visti).toEqual(['Pagina di accesso:200', 'Invio credenziali:200']);
    const r = new Traccia(async () => { throw new ErroreRete('giù'); });
    const v: string[] = [];
    r.alPasso = (p) => v.push(String(p.stato));
    await expect(accediPortale(r, CRED)).rejects.toBeInstanceOf(ErroreRete);
    expect(v).toEqual(['rete']);
  });

  it('messaggi d\'errore senza parametri; letture che continuano dopo un errore', async () => {
    expect(messaggioSicuro(new Error('Too many follow-up requests: https://a.it/x?cf=SEGRETO&p=1 fine'))).toBe('Too many follow-up requests: https://a.it/x?… fine');
    expect(messaggioSicuro('testo')).toBe('testo');
    expect(messaggioSicuro(new Error(''))).toBe('nessun messaggio');
    const base = portaleFinto();
    const web = async (q: RichiestaWeb) => {
      if (q.url.includes('/dati/fiscali') || q.url.includes('/tokenB2BCookie/')) throw new ErroreRete('Rete: Too many follow-up requests: 21');
      return base.web(q);
    };
    const t = new Traccia(web);
    await accediPortale(t, CRED);
    expect(await letturaDiProva(t)).toEqual({ datiEsercente: false, fattureUltimi30Giorni: null, adesione: true });
    expect(t.testo()).toContain('DCO: dati esercente · GET ivaservizi.agenziaentrate.gov.it/ser/api/documenti/v1/doc/documenti/dati/fiscali → rete · errore: Rete: Too many follow-up requests: 21');
    const altro = new Traccia(async (q) => (q.url.includes('/tokenB2BCookie/') ? base.web(q) : q.url.includes('/rs/fe/') ? (() => { throw new ErroreRete('x'); })() : base.web(q)));
    await accediPortale(altro, CRED);
    expect((await letturaDiProva(altro)).fattureUltimi30Giorni).toBeNull();
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
