const CACHE_NAME = 'task-list-v3';
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json'
];

// Instalar Service Worker
self.addEventListener('install', (event) => {
    console.log('Service Worker instalado');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Cache abierto');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

// Activar Service Worker
self.addEventListener('activate', (event) => {
    console.log('Service Worker activado');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Eliminando cache viejo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Manejar fetch
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            }
        )
    );
});

// Manejar notificaciones push (para futuro)
self.addEventListener('push', function(event) {
    console.log('Push recibido:', event);
    if (!event.data) return;
    
    try {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: '/',
            badge: '/',
            vibrate: [200, 100, 200],
            tag: 'task-reminder',
            requireInteraction: true,
            actions: [
                {
                    action: 'open',
                    title: '📱 Abrir App'
                },
                {
                    action: 'close',
                    title: '❌ Cerrar'
                }
            ]
        };

        event.waitUntil(
            self.registration.showNotification(data.title || 'Recordatorio', options)
        );
    } catch (error) {
        console.log('Error en push:', error);
    }
});

// Manejar clic en notificación
self.addEventListener('notificationclick', function(event) {
    console.log('Notificación clickeada:', event);
    event.notification.close();
    
    if (event.action === 'open' || event.action === '') {
        event.waitUntil(
            clients.matchAll({ 
                type: 'window',
                includeUncontrolled: true 
            })
            .then(function(clientList) {
                // Buscar si ya hay una ventana abierta
                for (const client of clientList) {
                    if (client.url.includes('/') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Si no hay ventana abierta, abrir una nueva
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
        );
    }
});

// Mensajes desde la app
self.addEventListener('message', (event) => {
    console.log('Mensaje recibido en SW:', event.data);
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});