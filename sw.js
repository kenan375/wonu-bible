// 원어서재 오프라인 저장소: 앱 화면은 미리 저장하고, 원어 데이터는 처음 받을 때 저장한다
const VERSION = "v5";
const SHELL = "wonu-shell-" + VERSION;
const DATA = "wonu-data-v3"; // 데이터가 바뀌면 숫자를 올린다
const SHELL_FILES = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest",
  "vendor/sql-wasm.js", "vendor/sql-wasm.wasm", "icons/icon-192.png", "icons/icon-512.png", "data/morph.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => (k.startsWith("wonu-shell-") && k !== SHELL) || (k.startsWith("wonu-data-") && k !== DATA)).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.hostname === "bible.helloao.org") {
    // 주석: 인터넷이 되면 새로 받아 저장, 안 되면 저장본
    e.respondWith(caches.open("wonu-comm-v1").then(async c => {
      try { const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r; }
      catch (err) { const hit = await c.match(e.request); if (hit) return hit; throw err; }
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  if (url.pathname.includes("/data/")) {
    // 원어 데이터: 저장본 우선, 없으면 받아서 저장
    e.respondWith(caches.open(DATA).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    }));
    return;
  }
  // 앱 화면: 인터넷이 되면 새 버전, 안 되면 저장본
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html"))));
});
