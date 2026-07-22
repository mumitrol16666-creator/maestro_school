import { apiRequest } from "@/lib/api-client";
import { SERVICE_WORKER_URL } from "@/lib/pwa-version";

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
  return navigator.serviceWorker.register(SERVICE_WORKER_URL, {
    scope: "/",
    updateViaCache: "none",
  });
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export function isPushSupportedOnDevice() {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function getPushServerStatus() {
  try {
    const config = await apiRequest<{ enabled: boolean; publicKey: string | null }>("/push/vapid-public-key");
    return { ready: Boolean(config.enabled && config.publicKey) };
  } catch {
    return { ready: false };
  }
}

export async function subscribeToPushNotifications() {
  const { ready } = await getPushServerStatus();
  if (!ready) {
    throw new Error("Сейчас не удалось подключить уведомления. Попробуйте чуть позже.");
  }

  const config = await apiRequest<{ enabled: boolean; publicKey: string | null }>("/push/vapid-public-key");
  if (!config.publicKey) {
    throw new Error("Сейчас не удалось подключить уведомления. Попробуйте чуть позже.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Нужно разрешить уведомления — иначе мы не сможем сообщать о важных изменениях.");
  }

  const registration = await getServiceWorkerRegistration();
  if (!registration) {
    throw new Error("Откройте Maestro в браузере Chrome на телефоне и попробуйте снова.");
  }

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
    throw new Error("Не удалось подключить уведомления. Попробуйте ещё раз.");
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
