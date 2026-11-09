/* Penguin Idle service worker: makes the game installable and playable offline.
 * Strategy: stale-while-revalidate. Serve the cached copy instantly, fetch a fresh one in the
 * background, and use it next time.
 * CACHE always matches the newest What's new entry (CHANGELOG in src/data.js); tools/check-data.js
 * checks this in CI, so every release reaches installed copies.
 */
const CACHE = "penguin-idle-v4.4";
const FILES = [
  "./", "index.html", "style.css", "manifest.webmanifest",
  "src/data.js", "src/engine/engine.js", "src/engine/progress.js", "src/engine/events.js", "src/engine/activities.js", "src/engine/actions.js", "src/engine/save.js", "src/engine/helpers.js", "src/qr.js", "src/audio/audio.js", "src/fx.js", "src/penguin.js", "src/ui/activities.js", "src/ui/dialogs.js", "src/ui/memories.js", "src/ui/panels.js", "src/ui/community.js", "src/ui/ui.js", "src/ui/topbar.js", "src/ui/patting.js", "src/scene/scene.js", "src/scene/waddlers.js", "src/scene/props.js", "src/main/dialogs.js", "src/main/main.js",
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
