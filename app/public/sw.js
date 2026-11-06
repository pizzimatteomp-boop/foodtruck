/*
 * Service worker di VegMan: rende l'app apribile senza rete.
 * - Pagina: prima la rete (per avere sempre l'ultima versione), senza rete la copia salvata.
 * - File dell'app in /assets/: hanno il nome che cambia a ogni versione, quindi si salvano una volta e basta.
 * - Icone, font e manifest: copia salvata subito, aggiornata in sottofondo.
 * Non tocca nient'altro: accesso Google (/__/), database e altri siti passano sempre dalla rete.
 */
// Cambiare il numero solo se cambia il modo di salvare: le copie vecchie vengono cancellate.
const PAGINA = 'vegman-pagina-v1';
const FILE = 'vegman-file-v1';
const MASSIMO_FILE = 60;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(PAGINA).then((c) => c.add('/')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const tenere = [PAGINA, FILE];
    for (const nome of await caches.keys()) if (!tenere.includes(nome)) await caches.delete(nome);
    await self.clients.claim();
  })());
});

async function primaLaRete(richiesta) {
  const cache = await caches.open(PAGINA);
  try {
    const risposta = await fetch(richiesta);
    if (risposta.ok) await cache.put('/', risposta.clone());
    return risposta;
  } catch {
    return (await cache.match('/')) ?? Response.error();
  }
}

async function primaLaCopia(richiesta) {
  const cache = await caches.open(FILE);
  const copia = await cache.match(richiesta);
  if (copia) return copia;
  const risposta = await fetch(richiesta);
  if (risposta.ok) {
    await cache.put(richiesta, risposta.clone());
    const chiavi = await cache.keys();
    for (const vecchia of chiavi.slice(0, Math.max(0, chiavi.length - MASSIMO_FILE))) await cache.delete(vecchia);
  }
  return risposta;
}

async function copiaPoiAggiorna(richiesta) {
  const cache = await caches.open(FILE);
  const copia = await cache.match(richiesta);
  const aggiorna = fetch(richiesta).then((r) => { if (r.ok) void cache.put(richiesta, r.clone()); return r; }).catch(() => copia);
  return copia ?? aggiorna;
}

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/__/')) return;
  if (r.mode === 'navigate') return e.respondWith(primaLaRete(r));
  if (url.pathname.startsWith('/assets/')) return e.respondWith(primaLaCopia(r));
  if (url.pathname.startsWith('/icone/') || url.pathname.startsWith('/font/') || url.pathname === '/manifest.webmanifest') return e.respondWith(copiaPoiAggiorna(r));
});
