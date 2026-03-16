import webpush, { type PushSubscription } from "web-push";

export type WebPushSubscriptionPayload = {
  endpoint: string;
  expirationTime?: number | null;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

export type WebPushSendResult = {
  ok: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  shouldDeactivate: boolean;
};

const SERVICE_WORKER_PATH = "/notifications-sw.js";
const SERVICE_WORKER_SCOPE = "/app/";

let vapidConfigured = false;

function getWebPushEnv() {
  return {
    publicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() || null,
    privateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() || null,
    subject: process.env.WEB_PUSH_VAPID_SUBJECT?.trim() || null,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function ensureVapidConfiguration() {
  if (vapidConfigured) return true;

  const env = getWebPushEnv();
  if (!env.publicKey || !env.privateKey || !env.subject) {
    return false;
  }

  webpush.setVapidDetails(env.subject, env.publicKey, env.privateKey);
  vapidConfigured = true;
  return true;
}

export function getWebPushClientConfig() {
  const env = getWebPushEnv();
  const webPushEnabled = Boolean(env.publicKey && env.privateKey && env.subject);

  return {
    webPushEnabled,
    webPushPublicKey: webPushEnabled ? env.publicKey : null,
    serviceWorkerPath: SERVICE_WORKER_PATH,
    serviceWorkerScope: SERVICE_WORKER_SCOPE,
  };
}

export function isValidWebPushSubscription(
  input: unknown
): input is WebPushSubscriptionPayload {
  if (!input || typeof input !== "object") return false;

  const subscription = input as WebPushSubscriptionPayload;
  return (
    isNonEmptyString(subscription.endpoint) &&
    isNonEmptyString(subscription.keys?.p256dh) &&
    isNonEmptyString(subscription.keys?.auth)
  );
}

export async function sendWebPushNotification(
  subscription: WebPushSubscriptionPayload,
  payload: Record<string, string | number>
): Promise<WebPushSendResult> {
  if (!ensureVapidConfiguration()) {
    return {
      ok: false,
      errorCode: "WEB_PUSH_NOT_CONFIGURED",
      errorMessage: "Web push VAPID environment variables are not configured",
      shouldDeactivate: false,
    };
  }

  try {
    await webpush.sendNotification(
      subscription as PushSubscription,
      JSON.stringify(payload)
    );

    return {
      ok: true,
      errorCode: null,
      errorMessage: null,
      shouldDeactivate: false,
    };
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 0);
    const shouldDeactivate = statusCode === 404 || statusCode === 410;

    return {
      ok: false,
      errorCode: shouldDeactivate ? "SubscriptionExpired" : "WEB_PUSH_ERROR",
      errorMessage:
        (typeof error?.body === "string" && error.body.slice(0, 300)) ||
        error?.message ||
        "Unknown web push error",
      shouldDeactivate,
    };
  }
}
