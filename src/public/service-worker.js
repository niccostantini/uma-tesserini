/**
 * SERVICE WORKER UMA FESTIVAL PWA
 * ==============================
 * 
 * Gestisce il caching offline per l'app UMA Festival.
 * Cache i file statici essenziali per il funzionamento offline.
 */

const CACHE_NAME = 'uma-festival-v1.0.0';
const API_CACHE_NAME = 'uma-api-v1.0.0';

// File statici da mettere in cache all'installazione
const STATIC_CACHE_FILES = [
  '/',
  '/index.html',
  '/script.js',
  '/manifest.json',
  '/icons/uma-icon-192.png',
  '/icons/uma-icon-512.png'
];

// Endpoint API da mettere in cache quando disponibili
const API_ENDPOINTS = [
  '/healthz',
  '/auth/validate',
  '/eventi',
  '/report/oggi'
];

/**
 * EVENTO: INSTALL
 * Installa il service worker e pre-carica i file essenziali
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installazione in corso...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cache creata, aggiungendo file statici...');
        return cache.addAll(STATIC_CACHE_FILES);
      })
      .then(() => {
        console.log('[SW] File statici cached con successo');
        // Force il nuovo SW ad attivarsi immediatamente
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Errore durante il caching:', error);
      })
  );
});

/**
 * EVENTO: ACTIVATE  
 * Pulisce le vecchie cache e prende controllo di tutte le pagine
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker attivazione in corso...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Rimuovi cache obsolete
            if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
              console.log('[SW] Rimozione cache obsoleta:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker attivo e pronto');
        // Prendi controllo immediato di tutte le pagine
        return self.clients.claim();
      })
  );
});

/**
 * EVENTO: FETCH
 * Intercetta tutte le richieste HTTP e applica strategie di caching
 */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Ignora richieste non HTTP/HTTPS
  if (!request.url.startsWith('http')) {
    return;
  }
  
  // Gestione richieste API
  if (url.pathname.startsWith('/auth/') || 
      url.pathname.startsWith('/qr/') ||
      url.pathname.startsWith('/tessere/') ||
      url.pathname.startsWith('/persone/') ||
      url.pathname.startsWith('/eventi/') ||
      url.pathname.startsWith('/vendite/') ||
      url.pathname.startsWith('/redenzioni/') ||
      url.pathname.startsWith('/report/') ||
      url.pathname.startsWith('/import/')) {
    
    event.respondWith(handleApiRequest(request));
    return;
  }
  
  // Gestione file statici
  event.respondWith(handleStaticRequest(request));
});

/**
 * Gestisce le richieste API con strategia Network-First
 * Prova prima la rete, poi la cache se offline
 */
async function handleApiRequest(request) {
  try {
    // Prova la rete per le API (dati sempre aggiornati)
    const networkResponse = await fetch(request);
    
    // Se la risposta è ok, salvala nella cache API
    if (networkResponse.ok) {
      const responseClone = networkResponse.clone();
      const cache = await caches.open(API_CACHE_NAME);
      
      // Cache solo GET requests e endpoint specifici
      if (request.method === 'GET' && shouldCacheApiEndpoint(request.url)) {
        cache.put(request, responseClone);
      }
    }
    
    return networkResponse;
    
  } catch (error) {
    console.log('[SW] Rete non disponibile per API, tentando cache...', error.message);
    
    // Se offline, prova la cache
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      console.log('[SW] Risposta API servita da cache:', request.url);
      return cachedResponse;
    }
    
    // Se nemmeno la cache ha la risposta, restituisci errore offline
    return new Response(
      JSON.stringify({
        error: 'Offline',
        message: 'Applicazione offline e dati non disponibili in cache'
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Gestisce le richieste per file statici con strategia Cache-First
 * Serve prima dalla cache, poi dalla rete
 */
async function handleStaticRequest(request) {
  // Prova la cache prima
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    console.log('[SW] File statico servito da cache:', request.url);
    return cachedResponse;
  }
  
  // Se non in cache, prova la rete
  try {
    const networkResponse = await fetch(request);
    
    // Se la risposta è ok, salvala nella cache
    if (networkResponse.ok) {
      const responseClone = networkResponse.clone();
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, responseClone);
    }
    
    return networkResponse;
    
  } catch (error) {
    console.log('[SW] File statico non disponibile offline:', request.url);
    
    // Per richieste di navigazione offline, restituisci index.html
    if (request.mode === 'navigate') {
      const cachedIndex = await caches.match('/index.html');
      if (cachedIndex) {
        return cachedIndex;
      }
    }
    
    // Altrimenti, restituisci errore
    return new Response('Offline - File non disponibile', { 
      status: 503,
      statusText: 'Service Unavailable' 
    });
  }
}

/**
 * Determina se un endpoint API deve essere messo in cache
 */
function shouldCacheApiEndpoint(url) {
  const pathname = new URL(url).pathname;
  
  // Cache solo endpoint di sola lettura che non cambiano spesso
  const cacheableEndpoints = [
    '/healthz',
    '/eventi',
    '/report/oggi'
  ];
  
  return cacheableEndpoints.some(endpoint => pathname.startsWith(endpoint));
}

/**
 * EVENTO: MESSAGE
 * Gestisce messaggi dal client per controllo cache
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_INFO') {
    // Restituisce informazioni sulla cache
    caches.keys().then(cacheNames => {
      event.ports[0].postMessage({
        caches: cacheNames,
        version: CACHE_NAME
      });
    });
  }
});

/**
 * EVENTO: SYNC (Background Sync - opzionale)
 * Per sincronizzazione in background quando torna la connessione
 */
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'uma-sync') {
    event.waitUntil(
      // Qui potresti implementare sincronizzazione dati
      // quando torna la connessione internet
      Promise.resolve()
    );
  }
});

console.log('[SW] Service Worker UMA Festival caricato - versione:', CACHE_NAME);
