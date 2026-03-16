import { and, eq } from "drizzle-orm";
import {
  donations,
  notificationInstallations,
  donorSpendNotifications,
} from "@/lib/server/schema";
import {
  isLikelyExpoPushToken,
  sendExpoPushNotification,
  type ExpoPushSendResult,
} from "@/lib/server/notifications/expo";
import {
  isValidWebPushSubscription,
  sendWebPushNotification,
  type WebPushSendResult,
  type WebPushSubscriptionPayload,
} from "@/lib/server/notifications/web";

type NotifyDonorSpendInput = {
  claimCodeId: string;
  donorUserId: string | null;
  amount: number;
};

type NotificationEventRecord = {
  id: string;
};

type DonorNotificationPreferences = {
  notifyOnSpend: boolean;
} | null;

export type NotificationInstallationRecord = {
  id: string;
  channel: string;
  expoPushToken: string | null;
  webPushSubscription: WebPushSubscriptionPayload | null;
};

type NotificationEventPatch = {
  status: string;
  failureReason?: string | null;
  sentAt?: Date | null;
};

type NotificationDeliveryInput = {
  userId: string;
  title: string;
  body: string;
  data: Record<string, string | number>;
};

type NotificationDeliveryResult = {
  successCount: number;
  totalInstallations: number;
  lastError: string | null;
};

export type SendUserAdminNotificationInput = {
  userId: string;
  title: string;
  body: string;
  adminEmail?: string | null;
  eventType?: string | null;
};

export type DonorSpendNotificationStore = {
  createEvent: (
    input: NotifyDonorSpendInput
  ) => Promise<NotificationEventRecord | null>;
  getDonorPreferences: (
    donorUserId: string
  ) => Promise<DonorNotificationPreferences>;
  listActiveInstallations: (
    donorUserId: string
  ) => Promise<NotificationInstallationRecord[]>;
  markInstallationStatus: (installationId: string, status: string) => Promise<void>;
  updateEvent: (eventId: string, patch: NotificationEventPatch) => Promise<void>;
};

export type DonorSpendNotificationSenders = {
  isLikelyExpoPushToken: (token: string) => boolean;
  sendExpoPushNotification: (payload: {
    to: string;
    title: string;
    body: string;
    sound: "default";
    data: Record<string, string | number>;
  }) => Promise<ExpoPushSendResult>;
  isValidWebPushSubscription: (
    subscription: unknown
  ) => subscription is WebPushSubscriptionPayload;
  sendWebPushNotification: (
    subscription: WebPushSubscriptionPayload,
    payload: Record<string, string | number>
  ) => Promise<WebPushSendResult>;
};

function formatPoints(amount: number): string {
  if (Number.isInteger(amount)) return `${amount}`;
  return amount.toFixed(2);
}

async function getServerDb() {
  const module = await import("@/lib/server/db");
  return module.db;
}

function createDefaultStore(): DonorSpendNotificationStore {
  return {
    async createEvent(input) {
      const db = await getServerDb();
      const [eventRow] = await db
        .insert(donorSpendNotifications)
        .values({
          claimCodeId: input.claimCodeId,
          donorUserId: input.donorUserId!,
          amount: input.amount.toString(),
          status: "pending",
        })
        .onConflictDoNothing({
          target: donorSpendNotifications.claimCodeId,
        })
        .returning();

      return eventRow ? { id: eventRow.id } : null;
    },
    async getDonorPreferences(donorUserId) {
      const db = await getServerDb();
      const donorDonation = await db.query.donations.findFirst({
        where: eq(donations.userId, donorUserId),
      });

      if (!donorDonation) return null;
      return { notifyOnSpend: donorDonation.notifyOnSpend };
    },
    async listActiveInstallations(donorUserId) {
      const db = await getServerDb();
      const rows = await db
        .select({
          id: notificationInstallations.id,
          channel: notificationInstallations.channel,
          expoPushToken: notificationInstallations.expoPushToken,
          webPushSubscription: notificationInstallations.webPushSubscription,
        })
        .from(notificationInstallations)
        .where(
          and(
            eq(notificationInstallations.userId, donorUserId),
            eq(notificationInstallations.status, "active")
          )
        );

      return rows.map((row) => ({
        ...row,
        webPushSubscription: row.webPushSubscription as WebPushSubscriptionPayload | null,
      }));
    },
    async markInstallationStatus(installationId, status) {
      const db = await getServerDb();
      await db
        .update(notificationInstallations)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(notificationInstallations.id, installationId));
    },
    async updateEvent(eventId, patch) {
      const db = await getServerDb();
      await db
        .update(donorSpendNotifications)
        .set(patch)
        .where(eq(donorSpendNotifications.id, eventId));
    },
  };
}

function createDefaultSenders(): DonorSpendNotificationSenders {
  return {
    isLikelyExpoPushToken,
    sendExpoPushNotification,
    isValidWebPushSubscription,
    sendWebPushNotification,
  };
}

async function deliverNotificationToActiveInstallations(
  input: NotificationDeliveryInput,
  store: Pick<DonorSpendNotificationStore, "listActiveInstallations" | "markInstallationStatus">,
  senders: DonorSpendNotificationSenders
): Promise<NotificationDeliveryResult> {
  const activeInstallations = await store.listActiveInstallations(input.userId);
  if (activeInstallations.length === 0) {
    return {
      successCount: 0,
      totalInstallations: 0,
      lastError: "No active notification installations",
    };
  }

  let successCount = 0;
  let lastError: string | null = null;

  for (const installation of activeInstallations) {
    if (installation.channel === "expo") {
      if (
        !installation.expoPushToken ||
        !senders.isLikelyExpoPushToken(installation.expoPushToken)
      ) {
        await store.markInstallationStatus(installation.id, "invalid");
        lastError = "Invalid Expo push token format";
        continue;
      }

      const sendResult = await senders.sendExpoPushNotification({
        to: installation.expoPushToken,
        title: input.title,
        body: input.body,
        sound: "default",
        data: input.data,
      });

      if (sendResult.ok) {
        successCount += 1;
        continue;
      }

      lastError = sendResult.errorMessage || sendResult.errorCode || "Push send failed";
      if (sendResult.errorCode === "DeviceNotRegistered") {
        await store.markInstallationStatus(installation.id, "invalid");
      }
      continue;
    }

    if (!senders.isValidWebPushSubscription(installation.webPushSubscription)) {
      await store.markInstallationStatus(installation.id, "invalid");
      lastError = "Invalid web push subscription";
      continue;
    }

    const sendResult = await senders.sendWebPushNotification(
      installation.webPushSubscription,
      input.data
    );

    if (sendResult.ok) {
      successCount += 1;
      continue;
    }

    lastError = sendResult.errorMessage || sendResult.errorCode || "Web push send failed";
    if (sendResult.shouldDeactivate) {
      await store.markInstallationStatus(installation.id, "invalid");
    }
  }

  return {
    successCount,
    totalInstallations: activeInstallations.length,
    lastError,
  };
}

export async function notifyDonorSpendWithDependencies(
  input: NotifyDonorSpendInput,
  store: DonorSpendNotificationStore,
  senders: DonorSpendNotificationSenders
): Promise<void> {
  if (!input.donorUserId) return;

  const eventRow = await store.createEvent(input);
  if (!eventRow) {
    // Claim already processed for notification delivery.
    return;
  }

  const donorPreferences = await store.getDonorPreferences(input.donorUserId);
  if (!donorPreferences || !donorPreferences.notifyOnSpend) {
    await store.updateEvent(eventRow.id, {
      status: "skipped",
      failureReason: !donorPreferences
        ? "No donor donation row"
        : "Donor notifications disabled",
    });
    return;
  }

  const delivery = await deliverNotificationToActiveInstallations(
    {
      userId: input.donorUserId,
      title: "Your SlugSwap contribution was used",
      body: `${formatPoints(input.amount)} points were spent.`,
      data: {
        claimCodeId: input.claimCodeId,
        amount: input.amount,
        eventType: "donor_spend_redeemed",
      },
    },
    store,
    senders
  );

  if (delivery.totalInstallations === 0) {
    await store.updateEvent(eventRow.id, {
      status: "skipped",
      failureReason: "No active notification installations",
    });
    return;
  }

  if (delivery.successCount > 0) {
    await store.updateEvent(eventRow.id, {
      status: "sent",
      sentAt: new Date(),
      failureReason: null,
    });
    return;
  }

  await store.updateEvent(eventRow.id, {
    status: "failed",
    failureReason: delivery.lastError || "All push deliveries failed",
  });
}

export async function sendUserAdminNotificationWithDependencies(
  input: SendUserAdminNotificationInput,
  store: Pick<DonorSpendNotificationStore, "listActiveInstallations" | "markInstallationStatus">,
  senders: DonorSpendNotificationSenders
): Promise<{ ok: boolean; successCount: number; totalInstallations: number; error: string | null }> {
  const sentAt = new Date().toISOString();
  const delivery = await deliverNotificationToActiveInstallations(
    {
      userId: input.userId,
      title: input.title,
      body: input.body,
      data: {
        title: input.title,
        body: input.body,
        eventType: input.eventType || "admin_notification",
        triggeredBy: input.adminEmail || "unknown",
        sentAt,
      },
    },
    store,
    senders
  );

  return {
    ok: delivery.successCount > 0,
    successCount: delivery.successCount,
    totalInstallations: delivery.totalInstallations,
    error: delivery.successCount > 0 ? null : delivery.lastError,
  };
}

export async function sendUserTestNotificationWithDependencies(
  input: { userId: string; adminEmail?: string | null },
  store: Pick<DonorSpendNotificationStore, "listActiveInstallations" | "markInstallationStatus">,
  senders: DonorSpendNotificationSenders
): Promise<{ ok: boolean; successCount: number; totalInstallations: number; error: string | null }> {
  return sendUserAdminNotificationWithDependencies(
    {
      userId: input.userId,
      title: "SlugSwap test notification",
      body: `Triggered from the admin panel${input.adminEmail ? ` by ${input.adminEmail}` : ""}.`,
      adminEmail: input.adminEmail,
      eventType: "admin_test_notification",
    },
    store,
    senders
  );
}

export async function notifyDonorSpend(
  input: NotifyDonorSpendInput
): Promise<void> {
  return notifyDonorSpendWithDependencies(
    input,
    createDefaultStore(),
    createDefaultSenders()
  );
}

export async function sendUserTestNotification(
  input: { userId: string; adminEmail?: string | null }
): Promise<{ ok: boolean; successCount: number; totalInstallations: number; error: string | null }> {
  return sendUserTestNotificationWithDependencies(
    input,
    createDefaultStore(),
    createDefaultSenders()
  );
}

export async function sendUserAdminNotification(
  input: SendUserAdminNotificationInput
): Promise<{ ok: boolean; successCount: number; totalInstallations: number; error: string | null }> {
  return sendUserAdminNotificationWithDependencies(
    input,
    createDefaultStore(),
    createDefaultSenders()
  );
}
