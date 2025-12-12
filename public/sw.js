/**
 * ARQUIVO: sw.js
 * DESCRIÇÃO: Service Worker Enterprise (Offline-First)
 */

const CACHE_NAME = 'applog-v2-enterprise';
const DYNAMIC_CACHE = 'applog-dynamic-v2';

// Arquivos vitais que devem ser baixados imediatamente na instalação
// Como você usa Vite, os nomes dos JS/CSS mudam no build, então focamos no básico.
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/img/icon-512.png'
  // O Vite injetará os CSS/JS dinamicamente, e nós os pegaremos no runtime.
];

// --- 1. INSTALAÇÃO (Cache Inicial) ---
self.addEventListener('install', (event) => {
  // Força o SW a assumir o controle imediatamente
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching Shell Assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// --- 2. ATIVAÇÃO (Limpeza de Versões Antigas) ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== DYNAMIC_CACHE) {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  // Garante que o SW controle todas as abas abertas imediatamente
  return self.clients.claim();
});

// --- 3. INTERCEPTAÇÃO DE REDE (Estratégia Híbrida) ---
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // A) IGNORAR FIREBASE/GOOGLE APIS
  // Deixamos a biblioteca do Firestore cuidar do cache de dados (ela faz isso melhor que nós).
  if (url.origin.includes('firestore.googleapis.com') || 
      url.origin.includes('identitytoolkit.googleapis.com') ||
      url.href.includes('google.com/recaptcha')) {
    return; // Segue fluxo normal da rede (o Firestore tem seu próprio persistence)
  }

  // B) ESTRATÉGIA: Stale-While-Revalidate (Para JS, CSS, Fontes, Imagens)
  // "Use o que tem no cache (rápido), mas atualize em segundo plano para a próxima vez."
  if (event.request.destination === 'script' || 
      event.request.destination === 'style' || 
      event.request.destination === 'image' ||
      event.request.destination === 'font') {
      
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          return caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // C) ESTRATÉGIA: Network First (Para HTML / Navegação)
  // "Tente pegar a versão mais nova do site. Se cair a net, mostre o cache."
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch(() => {
          // Se falhar (offline), pega do cache
          return caches.match(event.request);
        })
    );
    return;
  }
});