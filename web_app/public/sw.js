const releaseVersion = new URL(self.location.href).searchParams.get("v") || "dev";
const cacheSuffix = releaseVersion.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80) || "dev";
const CACHE_VERSION = `maestro-${cacheSuffix}`;
// В-18, decision of 02.11: the app shell is kept so the app opens without network — the two
// start pages and the static files they load. They hold no student data: that comes from the
// API, which is never cached here (the saved home lives on the device in the app itself).
// A page that is not in the shell opens the «Нет связи» page.
const OFFLINE_URL = "/offline.html";
const OFFLINE_ASSETS = [OFFLINE_URL, "/brand/guitar-avatar.png"];
const SHELL_PAGES = new Set(["/dashboard", "/login"]);
// A release build names its static files by content, so a kept copy is never out of date.
const IMMUTABLE_STATIC = releaseVersion !== "dev";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(OFFLINE_ASSETS))
      // Without the page the app still works online; installing must not fail over it.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("maestro-") && key !== CACHE_VERSION)
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  );
});

function isShellAsset(url) {
  return url.pathname.startsWith("/_next/static/")
    || url.pathname.startsWith("/brand/")
    || url.pathname === "/manifest.webmanifest"
    || url.pathname === OFFLINE_URL;
}

function fromCache(key) {
  return caches.match(key, { cacheName: CACHE_VERSION });
}

async function networkFirst(event, request, cacheKey) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic" && !response.redirected) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.put(cacheKey, copy)).catch(() => undefined));
    }
    return response;
  } catch (error) {
    const cached = await fromCache(cacheKey);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(event, request) {
  const cached = await fromCache(request);
  return cached || networkFirst(event, request, request);
}

async function openPage(event, url) {
  try {
    if (SHELL_PAGES.has(url.pathname)) return await networkFirst(event, event.request, `${url.origin}${url.pathname}`);
    return await fetch(event.request);
  } catch {
    return (await fromCache(OFFLINE_URL)) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate") {
    event.respondWith(openPage(event, url));
    return;
  }
  if (!isShellAsset(url)) return;
  event.respondWith(
    (IMMUTABLE_STATIC && url.pathname.startsWith("/_next/static/")
      ? cacheFirst(event, event.request)
      : networkFirst(event, event.request, event.request)
    ).catch(() => Response.error()),
  );
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Новое уведомление",
    body: "У вас новое уведомление",
    url: "/dashboard",
    tag: "maestro",
  };

  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/brand/guitar-avatar.png",
      badge: "/brand/notification-badge.svg",
      tag: payload.tag,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard";
  const absoluteUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(absoluteUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(absoluteUrl);
      return undefined;
    }),
  );
});
