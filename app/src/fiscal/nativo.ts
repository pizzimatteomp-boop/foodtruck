/**
 * Trasporto per l'app Android: usa l'HTTP nativo di Capacitor (niente blocchi CORS, cookie della
 * sessione del portale gestiti dal telefono). La funzione HTTP si passa da fuori, così qui non
 * dipendiamo da Capacitor e la logica si prova senza telefono.
 */
import type { RichiestaWeb, RispostaWeb, Web } from './portale';
import { ErroreRete, type Richiesta, type Risposta, type Trasporto } from './trasporto';

export const BASE_DCO = 'https://ivaservizi.agenziaentrate.gov.it/ser/api/documenti/v1/';

/** Stessa forma di CapacitorHttp.request. */
export interface OpzioniHttp {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  data?: unknown;
  responseType: 'json' | 'arraybuffer' | 'text';
  connectTimeout: number;
  readTimeout: number;
}
export interface RispostaHttp {
  status: number;
  headers: Record<string, string>;
  data: unknown;
  url?: string;
}
export type FunzioneHttp = (o: OpzioniHttp) => Promise<RispostaHttp>;

function intestazione(h: Record<string, string>, nome: string): string {
  const k = Object.keys(h).find((x) => x.toLowerCase() === nome);
  return k ? h[k]! : '';
}

function byteDaBase64(s: string): Uint8Array {
  const b = atob(s);
  const u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}

/** Legge il corpo secondo il tipo: PDF → byte, JSON → oggetto, altro → testo. */
export function leggiCorpo(tipo: string, dati: unknown): unknown {
  if (/application\/pdf/i.test(tipo)) {
    if (dati instanceof Uint8Array) return dati;
    if (dati instanceof ArrayBuffer) return new Uint8Array(dati);
    if (typeof dati === 'string') { try { return byteDaBase64(dati); } catch { return dati; } }
    return dati;
  }
  if (/json/i.test(tipo) && typeof dati === 'string') {
    try { return dati.trim() ? JSON.parse(dati) : null; } catch { return dati; }
  }
  return dati;
}

export function trasportoNativo(http: FunzioneHttp, base = BASE_DCO, attesaMs = 30000): Trasporto {
  return {
    async invia(r: Richiesta): Promise<Risposta> {
      const pdf = /\/stampa\//.test(r.percorso);
      let x: RispostaHttp;
      try {
        x = await http({
          url: base + r.percorso,
          method: r.metodo,
          headers: { Accept: pdf ? 'application/pdf' : 'application/json', ...(r.metodo === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
          ...(r.corpo === undefined ? {} : { data: r.corpo }),
          responseType: pdf ? 'arraybuffer' : 'json',
          connectTimeout: attesaMs,
          readTimeout: attesaMs,
        });
      } catch (e) {
        throw new ErroreRete(`Rete: ${(e as Error)?.message ?? 'errore sconosciuto'}`);
      }
      const tipo = intestazione(x.headers ?? {}, 'content-type');
      return { stato: x.status, tipo, corpo: leggiCorpo(tipo, x.data), ...(x.url ? { urlFinale: x.url } : {}) };
    },
  };
}

/**
 * «Browser» per l'accesso al portale: segue i rimandi, i cookie li tiene il telefono.
 * Si presenta con lo stesso User-Agent della WebView (Chrome per Android).
 */
export function webNativo(http: FunzioneHttp, userAgent: string, attesaMs = 30000): Web {
  return async (r: RichiestaWeb): Promise<RispostaWeb> => {
    const headers: Record<string, string> = { 'User-Agent': userAgent, Accept: r.json !== undefined ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', ...r.intestazioni };
    let data: unknown;
    if (r.modulo) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; data = r.modulo; }
    else if (r.json !== undefined) { headers['Content-Type'] = 'application/json'; data = r.json; }
    let x: RispostaWeb | undefined;
    try {
      const y = await http({ url: r.url, method: r.metodo, headers, ...(data === undefined ? {} : { data }), responseType: r.binario ? 'arraybuffer' : 'text', connectTimeout: attesaMs, readTimeout: attesaMs });
      x = { stato: y.status, url: y.url || r.url, intestazioni: y.headers ?? {}, testo: typeof y.data === 'string' ? y.data : JSON.stringify(y.data ?? '') };
      // Con «arraybuffer» l'HTTP nativo restituisce i byte in base64.
      if (r.binario) x = { ...x, testo: '', byte: y.data instanceof Uint8Array ? y.data : typeof y.data === 'string' ? byteDaBase64(y.data) : new Uint8Array() };
    } catch (e) {
      throw new ErroreRete(`Rete: ${(e as Error)?.message ?? 'errore sconosciuto'}`);
    }
    return x;
  };
}
