import { apiRequest } from "@/lib/api-client";

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function getServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function isPushAvailable() {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  const config = await apiRequest<{ enabled: boolean; publicKey: string | null }>("/push/vapid-public-key");
  return config.enabled && Boolean(config.publicKey);
}

export async function subscribeToPushNotifications() {
  const config = await apiRequest<{ enabled: boolean; publicKey: string | null }>("/push/vapid-public-key");
  if (!config.enabled || !config.publicKey) {
    throw new Error("Push-уведомления пока не настроены на сервере");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Разрешите уведомления в настройках браузера");
  }

  const registration = await getServiceWorkerRegistration();
  if (!registration) throw new Error("Service Worker недоступен");

  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Не удалось оформить подписку на уведомления");
  }

  await apiRequest("/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    }),
  });

  return true;
}

export async function unsubscribeFromPushNotifications() {
  const registration = await getServiceWorkerRegistration();
  if (!registration) return false;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;

  const endpoint = subscription.endpoint;
  await apiRequest("/push/subscribe", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  });
  await subscription.unsubscribe();
  return true;
}

export async function sendTestPushNotification() {
  return apiRequest<{ sent: number; failed: number; skipped?: boolean }>("/push/test", {
    method: "POST",
    body: JSON.stringify({}),
  });
}
