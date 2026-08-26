const CACHE_NAME = 'la-sosta-v1';
const filesToCache = [
    './',
    './index.html',
    './style.css',
    './db.js',
    './logo.png',
    './modulo_mappa.html',
    './modulo_calendario.html',
    './modulo_report.html',
    './modulo_transito.html',
    './modulo_gestore.html'
];

// Salva i file in cache all'installazione
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(filesToCache);
        })
    );
});

// Recupera i file dalla cache se manca internet
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
