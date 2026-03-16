import type {
  NotificationClientConfig,
  WebPushSubscriptionPayload,
} from "./api";

function assertWebPushSupport() {
  if (typeof window === "undefined") {
    throw new Error("Web notifications are unavailable during server rendering.");
  }
  if (!window.isSecureContext) {
    throw new Error("Web notifications require HTTPS.");
  }
  if (!("Notification" in window)) {
    throw new Error("This browser does not support notifications.");
  }
  if (!("serviceWorker" in navigator)) {
    throw new Error("This browser does not support service workers.");
  }
  if (!("PushManager" in window)) {
    throw new Error("This browser does not support push subscriptions.");
  }
}

function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

export function supportsWebPushNotifications() {
  if (typeof window === "undefined") return false;
  return (
    window.isSecureContext &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function normalizeSubscription(
  subscription: PushSubscriptionJSON
): WebPushSubscriptionPayload {
  if (
    typeof subscription.endpoint !== "string" ||
    !subscription.endpoint ||
    typeof subscription.keys?.p256dh !== "string" ||
    typeof subscription.keys?.auth !== "string"
  ) {
    throw new Error("Browser returned an invalid push subscription.");
  }

  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ?? null,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  };
}

async function getAppServiceWorker(config: NotificationClientConfig) {
  await navigator.serviceWorker.register(config.serviceWorkerPath, {
    scope: config.serviceWorkerScope,
  });

  const registration = await navigator.serviceWorker.ready;
  return registration;
}

export async function ensureWebPushSubscription(
  config: NotificationClientConfig
): Promise<WebPushSubscriptionPayload> {
  assertWebPushSupport();

  if (!config.webPushEnabled || !config.webPushPublicKey) {
    throw new Error("Web notifications are not configured yet.");
  }

  const registration = await getAppServiceWorker(config);

  let permission = Notification.permission;
  if (permission !== "granted") {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    throw new Error("Notifications permission denied.");
  }

  const existingSubscription = await registration.pushManager.getSubscription();
  if (existingSubscription) {
    return normalizeSubscription(existingSubscription.toJSON());
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(config.webPushPublicKey),
  });

  return normalizeSubscription(subscription.toJSON());
}

export async function unsubscribeCurrentWebPush() {
  if (!supportsWebPushNotifications()) return;

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe();
}
