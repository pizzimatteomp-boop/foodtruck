/**
 * Accesso al portale dell'Agenzia delle Entrate con Fisconline e letture di prova (solo lettura).
 * Vedi CLAUDE.md, «Fatture e Corrispettivi: cosa sappiamo» e «Documento commerciale online».
 *
 * Sicurezza:
 *  - le credenziali vanno solo nel corpo JSON dell'accesso (e il codice fiscale nella scelta dell'utenza);
 *  - il resoconto («traccia») contiene solo passi, indirizzi SENZA parametri, codici di risposta e NOMI
 *    di campi/chiavi: mai valori, cookie, token o credenziali (verificato dai test);
 *  - un accesso rifiutato non viene mai ripetuto da solo (troppi tentativi bloccano l'utenza Fisconline).
 */
import type { Credenziali } from './cassaforte';

export const IVASERVIZI = 'https://ivaservizi.agenziaentrate.gov.it';
export const PORTALE = 'https://portale.agenziaentrate.gov.it';
/** Partita IVA di VegMan (pubblica, in CLAUDE.md): utenza «Me stesso». */
export const PARTITA_IVA = '02948500422';

export interface RichiestaWeb {
  url: string;
  metodo: 'GET' | 'POST';
  intestazioni?: Record<string, string>;
  /** Corpo come modulo HTML (application/x-www-form-urlencoded). */
  modulo?: Record<string, string>;
  /** Corpo JSON. */
  json?: unknown;
}
export interface RispostaWeb {
  stato: number;
  /** Indirizzo finale dopo i rimandi. */
  url: string;
  intestazioni: Record<string, string>;
  testo: string;
}
/** Una richiesta HTTP «come un browser»: segue i rimandi e conserva i cookie (sul telefono: HTTP nativo). */
export type Web = (r: RichiestaWeb) => Promise<RispostaWeb>;

export interface PassoTraccia {
  passo: string;
  metodo: 'GET' | 'POST';
  indirizzo: string;
  stato: number | 'rete';
  finale?: string;
  tipo?: string;
  nota?: string;
}

/** Codici di errore dell'accesso (dal codice della pagina di accesso dell'Agenzia). */
const MOTIVI: Record<string, string> = {
  INVALID_CREDENTIALS: 'credenziali errate',
  PASSWORD_EXPIRED: 'password scaduta: cambiala sul sito dell\'Agenzia e salvala di nuovo qui',
  FAILED_LOGIN_ATTEMPTS: 'troppi tentativi falliti',
  ACCOUNT_LOCKED: 'utenza bloccata',
};

export class AccessoRifiutato extends Error {
  override name = 'AccessoRifiutato';
  constructor(readonly codice: string) {
    super(`Il portale ha rifiutato l'accesso (${MOTIVI[codice] ?? codice}). L'app non riprova da sola.`);
  }
}
export class PortaleCambiato extends Error {
  override name = 'PortaleCambiato';
}

/** Solo dominio e percorso: niente parametri (possono contenere valori). */
export function senzaParametri(url: string): string {
  try { const u = new URL(url); return `${u.host}${u.pathname}`; } catch { return '?'; }
}

function intestazione(h: Record<string, string>, nome: string): string | undefined {
  const k = Object.keys(h).find((x) => x.toLowerCase() === nome);
  return k === undefined ? undefined : h[k];
}

const ENTITA: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' };
export function decodifica(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (t, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITA[e.toLowerCase()] ?? t;
  });
}

export interface Ponte { tipo: 'modulo' | 'meta' | 'script'; url: string; metodo: 'GET' | 'POST'; campi: Record<string, string> }

const AGENZIA = /^https:\/\/([a-z0-9-]+\.)*agenziaentrate\.gov\.it\//i;

/**
 * Pagina «ponte» che un browser attraverserebbe da solo: modulo che si invia da sé, meta refresh,
 * rimando via script. Solo verso siti dell'Agenzia. null se la pagina non rimanda altrove.
 */
export function pontePagina(html: string, base: string): Ponte | null {
  const assoluto = (u: string) => { try { const x = new URL(decodifica(u), base).toString(); return AGENZIA.test(x) ? x : null; } catch { return null; } };
  if (/\.submit\(\s*\)|onload\s*=/i.test(html)) {
    const f = /<form\b([^>]*)>([\s\S]*?)<\/form>/i.exec(html);
    if (f) {
      const a = attributi(f[1]!);
      const url = assoluto(a.action ?? base);
      if (url) {
        const campi: Record<string, string> = {};
        for (const m of f[2]!.matchAll(/<input\b([^>]*)>/gi)) {
          const x = attributi(m[1]!);
          if (x.name && !['submit', 'button', 'image', 'reset'].includes((x.type ?? '').toLowerCase())) campi[x.name] = decodifica(x.value ?? '');
        }
        return { tipo: 'modulo', url, metodo: (a.method ?? 'get').toUpperCase() === 'POST' ? 'POST' : 'GET', campi };
      }
    }
  }
  const meta = /<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'][^"']*?url\s*=\s*([^"'>\s]+)/i.exec(html);
  if (meta) { const url = assoluto(meta[1]!.replace(/^['"]|['"]$/g, '')); if (url) return { tipo: 'meta', url, metodo: 'GET', campi: {} }; }
  const js = /(?:location\.(?:href\s*=|replace\(|assign\()|location\s*=)\s*["']([^"']+)["']/i.exec(html);
  if (js) { const url = assoluto(js[1]!); if (url) return { tipo: 'script', url, metodo: 'GET', campi: {} }; }
  return null;
}

function attributi(tag: string): Record<string, string> {
  const a: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    a[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return a;
}

/**
 * Descrizione della pagina di accesso (pubblica, prima di entrare) quando il modulo non si trova:
 * solo struttura (titolo, moduli, NOMI dei campi, script, collegamenti di accesso), mai valori.
 */
export function strutturaPagina(html: string, base: string): string {
  const percorso = (u: string | undefined) => {
    if (!u) return '-';
    if (/^javascript:/i.test(u)) return 'javascript';
    try { const x = new URL(u, base); return x.host === new URL(base).host ? x.pathname : `${x.host}${x.pathname}`; } catch { return '?'; }
  };
  const titolo = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, ' ').trim().slice(0, 60) ?? '-';
  const moduli = [...html.matchAll(/<form\b([^>]*)>/gi)].map((f) => { const a = attributi(f[1]!); return `${(a.method ?? 'get').toUpperCase()} ${percorso(a.action)}${a.name || a.id ? ` (${a.name || a.id})` : ''}`; });
  const campi = [...html.matchAll(/<(input|select|textarea|button)\b([^>]*)>/gi)].map((m) => { const a = attributi(m[2]!); return a.name || a.id ? `${a.name || `#${a.id}`}(${(a.type ?? m[1]!).toLowerCase()})` : ''; }).filter(Boolean);
  const script = [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => attributi(m[1]!).src).filter(Boolean).map((x) => percorso(x));
  const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].length;
  const cornici = [...html.matchAll(/<i?frame\b([^>]*)>/gi)].map((m) => percorso(attributi(m[1]!).src));
  const accessi = [...new Set([...html.matchAll(/<a\b([^>]*)>/gi)].map((m) => attributi(m[1]!).href)
    .filter((h): h is string => !!h && /login|fisconline|entratel|spid|cie|sam\/|auth/i.test(h)).map((h) => percorso(h)))].slice(0, 12);
  const parole = ['IDToken', 'Fisconline', 'SPID', 'CIE', 'XUI', 'json/authenticate', 'authId', 'callbacks', 'noscript', 'location.href', 'submit()']
    .filter((k) => html.includes(k));
  return [
    `pagina ${html.length} caratteri, titolo «${titolo}»`,
    `moduli: ${moduli.join(' | ') || 'nessuno'}`,
    `campi: ${campi.slice(0, 30).join(', ') || 'nessuno'}`,
    `script: ${script.slice(0, 15).join(', ') || 'nessuno'} + ${inline} interni`,
    ...(cornici.length ? [`cornici: ${cornici.join(', ')}`] : []),
    `collegamenti di accesso: ${accessi.join(', ') || 'nessuno'}`,
    `contiene: ${parole.join(', ') || 'nessuna parola chiave'}`,
  ].join('; ');
}

/** È la pagina di accesso? (dopo il POST vuol dire: rifiutato) */
export function eLogin(url: string): boolean {
  return /iampe\.agenziaentrate\.gov\.it\/sam\/UI\/Login/i.test(url);
}

function chiaviJson(testo: string): string | undefined {
  try {
    const v = JSON.parse(testo) as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) return `chiavi: ${Object.keys(v).join(', ')}`;
    if (Array.isArray(v)) return `elenco di ${v.length}`;
  } catch { /* non JSON */ }
  return undefined;
}

/** Messaggio d'errore tecnico senza parametri degli indirizzi (che potrebbero contenere valori). */
export function messaggioSicuro(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/\?[^\s'"]*/g, '?…').replace(/\s+/g, ' ').slice(0, 200) || 'nessun messaggio';
}

export class Traccia {
  readonly passi: PassoTraccia[] = [];
  constructor(private readonly web: Web) {}

  async chiama(passo: string, r: RichiestaWeb, nota?: (x: RispostaWeb) => string | undefined): Promise<RispostaWeb> {
    let x: RispostaWeb;
    try { x = await this.web(r); } catch (e) {
      this.passi.push({ passo, metodo: r.metodo, indirizzo: senzaParametri(r.url), stato: 'rete', nota: `errore: ${messaggioSicuro(e)}` });
      throw e;
    }
    const tipo = (intestazione(x.intestazioni, 'content-type') ?? '').split(';')[0]!.trim();
    const n = nota?.(x);
    this.passi.push({
      passo, metodo: r.metodo, indirizzo: senzaParametri(r.url), stato: x.stato,
      ...(senzaParametri(x.url) !== senzaParametri(r.url) ? { finale: senzaParametri(x.url) } : {}),
      ...(tipo ? { tipo } : {}), ...(n ? { nota: n } : {}),
    });
    return x;
  }

  /** Testo da incollare in chat: nessun valore. */
  testo(): string {
    return this.passi.map((p, i) => `${i + 1}. ${p.passo} · ${p.metodo} ${p.indirizzo} → ${p.stato}${p.finale ? ` → ${p.finale}` : ''}${p.tipo ? ` [${p.tipo}]` : ''}${p.nota ? ` · ${p.nota}` : ''}`).join('\n');
  }
}

const ts = () => `v=${Date.now()}`;

const LOGIN_API = 'https://iampe.agenziaentrate.gov.it/api/login/telematico';

/** Il codice d'errore («details») della risposta di accesso, se c'è. */
export function codiceErrore(testo: string): string | undefined {
  try { const d = (JSON.parse(testo) as { details?: unknown }).details; return typeof d === 'string' && /^[A-Z_]{3,40}$/.test(d) ? d : undefined; } catch { return undefined; }
}

/** Indirizzo dove andare dopo l'accesso (parametro goto della pagina di accesso, solo siti dell'Agenzia). */
export function destinazione(urlAccesso: string): string {
  try {
    const g = new URL(urlAccesso).searchParams.get('goto');
    if (g && /^https:\/\/[a-z0-9.-]+\.agenziaentrate\.gov\.it\//i.test(g)) return g;
  } catch { /* indirizzo non valido */ }
  return `${PORTALE}/PortaleWeb/home?to=FATBTB`;
}

/** Accesso Fisconline e scelta «Me stesso». */
export async function accediPortale(t: Traccia, c: Credenziali): Promise<void> {
  await entraNelPortale(t, c);
  await scegliMeStesso(t, c);
}

/**
 * Accesso Fisconline (come la pagina dell'Agenzia: JSON a /api/login/telematico) e apertura di Fatture e Corrispettivi.
 * Lancia AccessoRifiutato (non ripetere!) o PortaleCambiato.
 */
export async function entraNelPortale(t: Traccia, c: Credenziali): Promise<void> {
  const pagina = await t.chiama('Pagina di accesso', { url: `${IVASERVIZI}/portale/`, metodo: 'GET' });
  if (!eLogin(pagina.url)) {
    t.passi[t.passi.length - 1]!.nota = strutturaPagina(pagina.testo, pagina.url);
    throw new PortaleCambiato('La pagina di accesso non è quella attesa.');
  }
  const dopo = await t.chiama('Invio credenziali', {
    url: LOGIN_API, metodo: 'POST', json: { username: c.codiceFiscale, password: c.password, pin: c.pin },
    intestazioni: { Origin: 'https://iampe.agenziaentrate.gov.it', Referer: pagina.url },
  }, (x) => { const k = codiceErrore(x.testo); return k ? `esito: ${k}` : chiaviJson(x.testo); });
  if (dopo.stato === 404 || dopo.stato === 405 || dopo.stato >= 500) throw new PortaleCambiato(`L'accesso ha risposto ${dopo.stato}.`);
  if (dopo.stato >= 300) throw new AccessoRifiutato(codiceErrore(dopo.testo) ?? `risposta ${dopo.stato}`);

  const home = await apriPagina(t, 'Fatture e Corrispettivi', destinazione(pagina.url));
  if (eLogin(home.url)) throw new PortaleCambiato('Dopo l\'accesso il portale chiede di nuovo le credenziali (sessione non tenuta).');
  if (!/to=FATBTB/.test(destinazione(pagina.url))) await apriPagina(t, 'Fatture e Corrispettivi', `${PORTALE}/PortaleWeb/home?to=FATBTB`);
  // Nel browser PortaleWeb rimanda qui: è la pagina che apre la sessione su ivaservizi.
  await apriPagina(t, 'Ingresso servizi IVA', `${IVASERVIZI}/instr/InstradamentofcWeb/home`).catch(() => undefined);
}

/** Apre una pagina come un browser: attraversa fino a 6 pagine ponte (moduli automatici, meta refresh, script). */
export async function apriPagina(t: Traccia, passo: string, url: string): Promise<RispostaWeb> {
  let r = await t.chiama(passo, { url, metodo: 'GET' });
  for (let i = 1; i <= 6; i++) {
    const p = /html/i.test(intestazione(r.intestazioni, 'content-type') ?? '') ? pontePagina(r.testo, r.url) : null;
    const ultimo = t.passi[t.passi.length - 1]!;
    if (!p) {
      if (/html/i.test(ultimo.tipo ?? '')) ultimo.nota = `titolo «${/<title[^>]*>([\s\S]*?)<\/title>/i.exec(r.testo)?.[1]?.replace(/\s+/g, ' ').trim().slice(0, 60) ?? '-'}», nessun rimando nella pagina`;
      return r;
    }
    ultimo.nota = `ponte (${p.tipo}) → ${senzaParametri(p.url)}${Object.keys(p.campi).length ? `; campi: ${Object.keys(p.campi).join(', ')}` : ''}`;
    r = await t.chiama(`${passo} · ponte ${i}`, p.metodo === 'POST' ? { url: p.url, metodo: 'POST', modulo: p.campi } : { url: p.url, metodo: 'GET' });
  }
  return r;
}

/** Scelta dell'utenza «Me stesso» in Fatture e Corrispettivi. */
export async function scegliMeStesso(t: Traccia, c: Credenziali): Promise<void> {
  const R = `${IVASERVIZI}/instr/instradamento-fatture-rest/rs`;
  await t.chiama('Avvio', { url: `${R}/initLight?${ts()}`, metodo: 'GET' }, (x) => chiaviJson(x.testo));
  const info = await t.chiama('Utente', { url: `${R}/infouser-fc?${ts()}`, metodo: 'GET' }, (x) => chiaviJson(x.testo));
  const pIva = partitaIvaDa(info.testo) ?? PARTITA_IVA;
  await t.chiama('Scelte utenza', { url: `${R}/wizardTemplate?${ts()}`, metodo: 'GET' });

  const scelta = { tipoutenza: 'meStesso', cf: c.codiceFiscale, pIva };
  let s = await t.chiama('Scelta «Me stesso» (JSON)', { url: `${R}/setUserChoice?${ts()}`, metodo: 'POST', json: scelta });
  if (s.stato >= 400) s = await t.chiama('Scelta «Me stesso» (modulo)', { url: `${R}/setUserChoice?${ts()}`, metodo: 'POST', modulo: scelta });
  const pronto = await t.chiama('Verifica scelta', { url: `${R}/fullTemplate?${ts()}`, metodo: 'GET' });
  if (s.stato >= 400 || pronto.stato >= 400) throw new PortaleCambiato('La scelta dell\'utenza «Me stesso» non è riuscita.');
}

/** Cerca una partita IVA (11 cifre) nella risposta «infouser-fc», senza conoscerne la forma esatta. */
export function partitaIvaDa(testo: string): string | undefined {
  try {
    const trova = (v: unknown, chiave = ''): string | undefined => {
      if (typeof v === 'string' && /p\.?iva|partitaiva/i.test(chiave) && /^\d{11}$/.test(v)) return v;
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { const r = trova(x, k); if (r) return r; }
      return undefined;
    };
    return trova(JSON.parse(testo));
  } catch { return undefined; }
}

/** Data ggmmaaaa sul fuso di Roma. */
export function ggmmaaaa(d: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}${p.month}${p.year}`;
}

export interface EsitoProva {
  datiEsercente: boolean;
  fattureUltimi30Giorni: number | null;
  adesione: boolean;
}

/** Letture di prova dopo l'accesso: niente si modifica, niente si scarica. */
export async function letturaDiProva(t: Traccia, oggi = new Date()): Promise<EsitoProva> {
  // Ogni lettura per conto suo: se una non riesce (già annotata nella traccia) si prova la successiva.
  const prova = async (f: () => Promise<RispostaWeb>) => { try { return await f(); } catch { return null; } };
  const json = (x: RispostaWeb | null) => { if (!x || x.stato !== 200 || eLogin(x.url)) return false; try { JSON.parse(x.testo); return true; } catch { return false; } };
  const dco = await prova(() => t.chiama('DCO: dati esercente', { url: `${IVASERVIZI}/ser/api/documenti/v1/doc/documenti/dati/fiscali`, metodo: 'GET' }, (x) => chiaviJson(x.testo)));
  const ad = await prova(() => t.chiama('Adesione consultazione', { url: `${IVASERVIZI}/ser/api/fatture/v1/ul/me/adesione/stato`, metodo: 'GET' }, (x) => chiaviJson(x.testo)));
  const tok = await prova(() => t.chiama('Codici per le fatture', { url: `${IVASERVIZI}/cons/cons-services/sc/tokenB2BCookie/get?${ts()}`, metodo: 'GET' },
    (x) => `x-b2bcookie ${intestazione(x.intestazioni, 'x-b2bcookie') ? 'presente' : 'assente'}, x-token ${intestazione(x.intestazioni, 'x-token') ? 'presente' : 'assente'}`));
  const b2b = tok && intestazione(tok.intestazioni, 'x-b2bcookie');
  const token = tok && intestazione(tok.intestazioni, 'x-token');
  let fatture: number | null = null;
  if (b2b && token) {
    const dal = ggmmaaaa(new Date(oggi.getTime() - 30 * 86400000));
    const el = await prova(() => t.chiama('Elenco fatture ricevute (30 giorni)', {
      url: `${IVASERVIZI}/cons/cons-services/rs/fe/ricevute/dal/${dal}/al/${ggmmaaaa(oggi)}/ricerca/ricezione?${ts()}`,
      metodo: 'GET', intestazioni: { 'x-b2bcookie': b2b, 'x-token': token },
    }, (x) => numeroFatture(x) === null ? chiaviJson(x.testo) : `${numeroFatture(x)} fatture`));
    fatture = el ? numeroFatture(el) : null;
  }
  return { datiEsercente: json(dco), fattureUltimi30Giorni: fatture, adesione: json(ad) };
}

function numeroFatture(x: RispostaWeb): number | null {
  try { const j = JSON.parse(x.testo) as { fatture?: unknown[] }; return x.stato === 200 && Array.isArray(j.fatture) ? j.fatture.length : null; } catch { return null; }
}
