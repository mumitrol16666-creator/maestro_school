const releaseVersion = new URL(self.location.href).searchParams.get("v") || "dev";
const cacheSuffix = releaseVersion.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80) || "dev";
const CACHE_VERSION = `maestro-${cacheSuffix}`;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
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

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request));
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
      icon: "/icons/icon-192.png?v=student-purple-1",
      badge: "/icons/icon-192.png?v=student-purple-1",
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
