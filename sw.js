const CACHE = "uni-v4";
const FILES = [
  "index.html", "style.css", "app.js", "manifest.json",
  "passphrase.js", "qr.js", "sync.js",
  "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"
];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    ))
  );
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});