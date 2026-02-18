
const CACHE_NAME = 'vitalis-ai-v2';
const STATIC_CACHE = 'vitalis-static-v2';
const DYNAMIC_CACHE = 'vitalis-dynamic-v2';
const IMAGE_CACHE = 'vitalis-images-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest',
  'https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

// Instalación
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando...');
  
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS)),
      caches.open(DYNAMIC_CACHE)
    ])
  );
  
  self.skipWaiting();
});

// Activación
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => !name.includes(CACHE_NAME))
          .map(name => caches.delete(name))
      );
    })
  );
  
  self.clients.claim();
});

// Fetch con estrategias diferentes
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Estrategia: Cache First para assets estáticos
  if (STATIC_ASSETS.includes(url.pathname) || request.destination === 'style' || request.destination === 'script') {
    event.respondWith(cacheFirst(request));
    return;
  }
  
  // Estrategia: Network First para API y datos
  if (url.pathname.startsWith('/api/') || request.destination === 'document') {
    event.respondWith(networkFirst(request));
    return;
  }
  
  // Estrategia: Stale While Revalidate para imágenes
  if (request.destination === 'image') {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
    return;
  }
  
  // Default: Network with cache fallback
  event.respondWith(networkWithCacheFallback(request));
});

// Estrategias de caché
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  
  if (cached) return cached;
  
  const response = await fetch(request);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(DYNAMIC_CACHE);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  
  const fetchPromise = fetch(request).then(response => {
    cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  
  return cached || fetchPromise;
}

async function networkWithCacheFallback(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

// Background Sync para datos offline
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-health-data') {
    event.waitUntil(syncHealthData());
  }
});

async function syncHealthData() {
  // Sincronizar datos guardados offline
  const db = await openDB('VitalisAI', 1);
  const tx = db.transaction('pendingSync', 'readonly');
  const store = tx.objectStore('pendingSync');
  const pending = await store.getAll();
  
  for (const item of pending) {
    try {
      await fetch('/api/sync', {
        method: 'POST',
        body: JSON.stringify(item),
        headers: { 'Content-Type': 'application/json' }
      });
      
      // Eliminar de pendientes
      const deleteTx = db.transaction('pendingSync', 'readwrite');
      await deleteTx.objectStore('pendingSync').delete(item.id);
    } catch (error) {
      console.error('Sync failed for item:', item);
    }
  }
}

// Push Notifications
self.addEventListener('push', (event) => {
  const data = event.data.json();
  
  const options = {
    body: data.body,
    icon: 'icon-192x192.png',
    badge: 'badge-72x72.png',
    image: data.image,
    vibrate: [100, 50, 100],
    data: data.data,
    actions: data.actions || [],
    requireInteraction: true
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Click en notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const action = event.action;
  const data = event.notification.data;
  
  event.waitUntil(
    clients.openWindow(data?.url || '/')
  );
});

// Mensajes desde la app
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
