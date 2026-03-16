import { and, eq } from "drizzle-orm";
import * as schema from "@/lib/server/schema";
import type { MobileIdentity } from "@/lib/server/mobile-auth";
import { isLikelyExpoPushToken } from "@/lib/server/notifications/expo";
import {
  getWebPushClientConfig,
  isValidWebPushSubscription,
  type WebPushSubscriptionPayload,
} from "@/lib/server/notifications/web";

export type NotificationChannel = "expo" | "web";
export type NotificationPlatform = "ios" | "android" | "web";

export type RegisterInstallationBody = {
  installationId?: string;
  channel?: NotificationChannel;
  platform?: NotificationPlatform;
  expoPushToken?: string;
  webPushSubscription?: WebPushSubscriptionPayload;
};

export type NotificationClientConfig = ReturnType<typeof getWebPushClientConfig>;

export type NotificationInstallationStore = {
  upsertIdentityUser: (identity: MobileIdentity) => Promise<void>;
  upsertInstallation: (input: {
    userId: string;
    installationId: string;
    channel: NotificationChannel;
    platform: NotificationPlatform;
    expoPushToken: string | null;
    webPushSubscription: WebPushSubscriptionPayload | null;
  }) => Promise<void>;
  markInstallationInactive: (input: {
    userId: string;
    installationId: string;
  }) => Promise<void>;
};

export type NotificationLifecycleResult =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> };

async function getServerDb() {
  const module = await import("@/lib/server/db");
  return module.db;
}

function validateInstallationId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return trimmed || null;
}

function createDefaultStore(): NotificationInstallationStore {
  return {
    async upsertIdentityUser(identity) {
      const db = await getServerDb();
      await db
        .insert(schema.users)
        .values({
          id: identity.userId,
          email: identity.email || `${identity.userId}@unknown.local`,
          name: identity.name,
          avatarUrl: identity.avatarUrl,
        })
        .onConflictDoUpdate({
          target: schema.users.id,
          set: {
            email: identity.email || `${identity.userId}@unknown.local`,
            name: identity.name,
            avatarUrl: identity.avatarUrl,
            updatedAt: new Date(),
          },
        });
    },
    async upsertInstallation(input) {
      const db = await getServerDb();
      const now = new Date();
      await db
        .insert(schema.notificationInstallations)
        .values({
          userId: input.userId,
          installationId: input.installationId,
          channel: input.channel,
          platform: input.platform,
          status: "active",
          expoPushToken: input.expoPushToken,
          webPushSubscription: input.webPushSubscription,
          lastSeenAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.notificationInstallations.installationId,
          set: {
            userId: input.userId,
            channel: input.channel,
            platform: input.platform,
            status: "active",
            expoPushToken: input.expoPushToken,
            webPushSubscription: input.webPushSubscription,
            lastSeenAt: now,
            updatedAt: now,
          },
        });
    },
    async markInstallationInactive(input) {
      const db = await getServerDb();
      await db
        .update(schema.notificationInstallations)
        .set({
          status: "inactive",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.notificationInstallations.installationId, input.installationId),
            eq(schema.notificationInstallations.userId, input.userId)
          )
        );
    },
  };
}

export async function registerInstallationWithDependencies(
  identity: MobileIdentity,
  body: RegisterInstallationBody,
  store: NotificationInstallationStore,
  clientConfig: NotificationClientConfig
): Promise<NotificationLifecycleResult> {
  const installationId = validateInstallationId(body.installationId);
  const channel = body.channel;
  const platform = body.platform;

  if (!installationId) {
    return { ok: false, status: 400, body: { error: "Missing installationId" } };
  }

  if (channel !== "expo" && channel !== "web") {
    return { ok: false, status: 400, body: { error: "Missing or invalid channel" } };
  }

  if (platform !== "ios" && platform !== "android" && platform !== "web") {
    return { ok: false, status: 400, body: { error: "Missing or invalid platform" } };
  }

  if (channel === "expo") {
    const expoPushToken = body.expoPushToken?.trim();
    if (
      !expoPushToken ||
      !isLikelyExpoPushToken(expoPushToken) ||
      (platform !== "ios" && platform !== "android")
    ) {
      return {
        ok: false,
        status: 400,
        body: { error: "Missing or invalid Expo installation payload" },
      };
    }

    await store.upsertIdentityUser(identity);
    await store.upsertInstallation({
      userId: identity.userId,
      installationId,
      channel,
      platform,
      expoPushToken,
      webPushSubscription: null,
    });

    return { ok: true, status: 200, body: { success: true } };
  }

  if (!clientConfig.webPushEnabled) {
    return {
      ok: false,
      status: 503,
      body: { error: "Web notifications are not configured on the server" },
    };
  }

  if (platform !== "web" || !isValidWebPushSubscription(body.webPushSubscription)) {
    return {
      ok: false,
      status: 400,
      body: { error: "Missing or invalid web push subscription" },
    };
  }

  await store.upsertIdentityUser(identity);
  await store.upsertInstallation({
    userId: identity.userId,
    installationId,
    channel,
    platform,
    expoPushToken: null,
    webPushSubscription: body.webPushSubscription,
  });

  return { ok: true, status: 200, body: { success: true } };
}

export async function unregisterInstallationWithDependencies(
  identity: MobileIdentity,
  installationIdInput: unknown,
  store: NotificationInstallationStore
): Promise<NotificationLifecycleResult> {
  const installationId = validateInstallationId(installationIdInput);
  if (!installationId) {
    return { ok: false, status: 400, body: { error: "Missing installationId" } };
  }

  await store.markInstallationInactive({
    userId: identity.userId,
    installationId,
  });

  return { ok: true, status: 200, body: { success: true } };
}

export async function registerInstallation(
  identity: MobileIdentity,
  body: RegisterInstallationBody
) {
  return registerInstallationWithDependencies(
    identity,
    body,
    createDefaultStore(),
    getWebPushClientConfig()
  );
}

export async function unregisterInstallation(
  identity: MobileIdentity,
  installationIdInput: unknown
) {
  return unregisterInstallationWithDependencies(
    identity,
    installationIdInput,
    createDefaultStore()
  );
}
