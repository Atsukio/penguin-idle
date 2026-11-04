/* Penguin Idle service worker: makes the game installable and playable offline.
 * Strategy: stale-while-revalidate. Serve the cached copy instantly, fetch a fresh one in the
 * background, and use it next time. Bump CACHE when the list of files changes.
 */
const CACHE = "penguin-idle-v4";
const FILES = [
  "./", "index.html", "style.css", "manifest.webmanifest",
  "src/data.js", "src/engine.js", "src/fx.js", "src/penguin.js", "src/ui.js", "src/main.js",
  "fonts/fonts.css", "fonts/fredoka-latin.woff2", "fonts/nunito-latin.woff2",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("penguin-idle-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
