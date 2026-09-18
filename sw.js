/* 超级工作台 Service Worker：离线可用 + 联网静默更新
   策略：页面=网络优先(离线回落缓存)；音乐/图片大文件=缓存优先；跨域请求(API)直连不缓存 */
const CACHE = 'wb-cache-20260919';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return; /* 天气/热搜/LLM 等 API 直连，离线时由页面自身降级 */

  /* 音乐与内置媒体：缓存优先（大文件，装一次永久离线可听） */
  if (/\/music\/|\/icon-|\.mp3$/.test(url.pathname)) {
    e.respondWith(
      caches.open(CACHE).then(c => c.match(req).then(r => r || fetch(req).then(resp => {
        if (resp && resp.status === 200) c.put(req, resp.clone());
        return resp;
      })))
    );
    return;
  }

  /* 页面与静态资源：网络优先，失败回落缓存（保证每次联网拿到最新版，断网照样打开） */
  e.respondWith(
    (async () => {
      const c = await caches.open(CACHE);
      try {
        const resp = await fetch(req);
        if (resp && resp.status === 200 && resp.type === 'basic') c.put(req, resp.clone());
        return resp;
      } catch (err) {
        const cached = await c.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const idx = await c.match('./index.html');
          if (idx) return idx;
        }
        return new Response('离线且无缓存', { status: 503, statusText: 'offline' });
      }
    })()
  );
});
