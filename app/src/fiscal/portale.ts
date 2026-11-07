/**
 * Accesso al portale dell'Agenzia delle Entrate con Fisconline e letture di prova (solo lettura).
 * Vedi CLAUDE.md, «Fatture e Corrispettivi: cosa sappiamo» e «Documento commerciale online».
 *
 * Sicurezza:
 *  - le credenziali vanno solo nel corpo del POST di accesso (e il codice fiscale nella scelta dell'utenza);
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

export class AccessoRifiutato extends Error {
  override name = 'AccessoRifiutato';
  constructor() { super('Il portale ha rifiutato l\'accesso (credenziali sbagliate, scadute o da cambiare). L\'app non riprova da sola.'); }
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

const ENTITA: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', '#39': '\'' };
function decodifica(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (t, e: string) => {
    if (/^#x/i.test(e)) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (/^#\d/.test(e) && !(e in ENTITA)) return String.fromCodePoint(Number(e.slice(1)));
    return ENTITA[e.toLowerCase()] ?? t;
  });
}
function attributi(tag: string): Record<string, string> {
  const a: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    a[m[1]!.toLowerCase()] = decodifica(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return a;
}

export interface Modulo {
  azione: string;
  metodo: 'GET' | 'POST';
  campi: { nome: string; valore: string; tipo: string }[];
}

/** Trova il modulo di accesso (quello con IDToken1) e ne legge azione e campi. */
export function leggiModulo(html: string, base: string): Modulo | null {
  for (const f of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const corpo = f[2]!;
    if (!/name\s*=\s*["']?IDToken1\b/i.test(corpo)) continue;
    const a = attributi(f[1]!);
    const campi = [...corpo.matchAll(/<input\b([^>]*)>/gi)].map((m) => attributi(m[1]!))
      .filter((x) => x.name)
      .map((x) => ({ nome: x.name!, valore: x.value ?? '', tipo: (x.type ?? 'text').toLowerCase() }));
    let azione: string;
    try { azione = new URL(a.action || base, base).toString(); } catch { return null; }
    return { azione, metodo: (a.method ?? 'get').toUpperCase() === 'POST' ? 'POST' : 'GET', campi };
  }
  return null;
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

/** Il modulo compilato: campi nascosti come sono, credenziali al loro posto, pulsanti esclusi. */
export function compilaModulo(m: Modulo, c: Credenziali): Record<string, string> {
  const dati: Record<string, string> = {};
  for (const x of m.campi) {
    if (['submit', 'button', 'image', 'reset', 'checkbox', 'radio', 'file'].includes(x.tipo)) continue;
    dati[x.nome] = x.valore;
  }
  dati.IDToken1 = c.codiceFiscale;
  dati.IDToken2 = c.password;
  dati.IDToken3 = c.pin;
  return dati;
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

export class Traccia {
  readonly passi: PassoTraccia[] = [];
  constructor(private readonly web: Web) {}

  async chiama(passo: string, r: RichiestaWeb, nota?: (x: RispostaWeb) => string | undefined): Promise<RispostaWeb> {
    let x: RispostaWeb;
    try { x = await this.web(r); } catch (e) {
      this.passi.push({ passo, metodo: r.metodo, indirizzo: senzaParametri(r.url), stato: 'rete' });
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

/** Accesso Fisconline e scelta «Me stesso». Lancia AccessoRifiutato (non ripetere!) o PortaleCambiato. */
export async function accediPortale(t: Traccia, c: Credenziali): Promise<void> {
  const pagina = await t.chiama('Pagina di accesso', { url: `${IVASERVIZI}/portale/`, metodo: 'GET' });
  const m = leggiModulo(pagina.testo, pagina.url);
  if (!m) {
    t.passi[t.passi.length - 1]!.nota = strutturaPagina(pagina.testo, pagina.url);
    throw new PortaleCambiato('Non trovo il modulo di accesso Fisconline nella pagina.');
  }
  const nascosti = m.campi.filter((x) => !/^IDToken[123]$/.test(x.nome)).map((x) => `${x.nome}(${x.tipo})`);
  t.passi[t.passi.length - 1]!.nota = `modulo ${m.metodo} → ${senzaParametri(m.azione)}; campi: ${nascosti.join(', ') || 'nessuno'}`;

  const dopo = await t.chiama('Invio credenziali', { url: m.azione, metodo: 'POST', modulo: compilaModulo(m, c) });
  if (dopo.stato >= 400) throw new PortaleCambiato(`L'accesso ha risposto ${dopo.stato}.`);
  if (eLogin(dopo.url) || leggiModulo(dopo.testo, dopo.url)) throw new AccessoRifiutato();

  const home = await t.chiama('Fatture e Corrispettivi', { url: `${PORTALE}/PortaleWeb/home?to=FATBTB`, metodo: 'GET' });
  if (eLogin(home.url)) throw new PortaleCambiato('Dopo l\'accesso il portale chiede di nuovo le credenziali (sessione non tenuta).');

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
  const dco = await t.chiama('DCO: dati esercente', { url: `${IVASERVIZI}/ser/api/documenti/v1/doc/documenti/dati/fiscali`, metodo: 'GET' }, (x) => chiaviJson(x.testo));
  const ad = await t.chiama('Adesione consultazione', { url: `${IVASERVIZI}/ser/api/fatture/v1/ul/me/adesione/stato`, metodo: 'GET' }, (x) => chiaviJson(x.testo));
  const tok = await t.chiama('Codici per le fatture', { url: `${IVASERVIZI}/cons/cons-services/sc/tokenB2BCookie/get?${ts()}`, metodo: 'GET' },
    (x) => `x-b2bcookie ${intestazione(x.intestazioni, 'x-b2bcookie') ? 'presente' : 'assente'}, x-token ${intestazione(x.intestazioni, 'x-token') ? 'presente' : 'assente'}`);
  const b2b = intestazione(tok.intestazioni, 'x-b2bcookie');
  const token = intestazione(tok.intestazioni, 'x-token');
  let fatture: number | null = null;
  if (b2b && token) {
    const dal = ggmmaaaa(new Date(oggi.getTime() - 30 * 86400000));
    const el = await t.chiama('Elenco fatture ricevute (30 giorni)', {
      url: `${IVASERVIZI}/cons/cons-services/rs/fe/ricevute/dal/${dal}/al/${ggmmaaaa(oggi)}/ricerca/ricezione?${ts()}`,
      metodo: 'GET', intestazioni: { 'x-b2bcookie': b2b, 'x-token': token },
    }, (x) => {
      try { const j = JSON.parse(x.testo) as { fatture?: unknown[] }; return Array.isArray(j.fatture) ? `${j.fatture.length} fatture` : chiaviJson(x.testo); } catch { return undefined; }
    });
    try { const j = JSON.parse(el.testo) as { fatture?: unknown[] }; if (el.stato === 200 && Array.isArray(j.fatture)) fatture = j.fatture.length; } catch { /* resta null */ }
  }
  const json = (x: RispostaWeb) => { try { JSON.parse(x.testo); return x.stato === 200; } catch { return false; } };
  return { datiEsercente: json(dco) && !eLogin(dco.url), fattureUltimi30Giorni: fatture, adesione: json(ad) };
}
