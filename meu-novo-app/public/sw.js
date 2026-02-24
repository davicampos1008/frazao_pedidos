// Este arquivo faz o celular reconhecer o site como um App instalável.
self.addEventListener('install', (e) => {
  console.log('[Service Worker] Instalado');
});

self.addEventListener('fetch', (e) => {
  // Apenas deixa a internet fluir normalmente
});