// ARQUIVO: sw.js
// Service Worker simples para permitir instalação (PWA)

const CACHE_NAME = 'applog-v1';

// Instalação do Service Worker
self.addEventListener('install', (e) => {
  console.log('[Service Worker] Instalado');
  e.waitUntil(self.skipWaiting());
});

// Ativação
self.addEventListener('activate', (e) => {
  console.log('[Service Worker] Ativado');
  e.waitUntil(self.clients.claim());
});

// Interceptação de Rede (Estratégia: Network First)
// Isso garante que o app sempre tente pegar a versão mais nova online.
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => {
      return caches.match(e.request);
    })
  );
});