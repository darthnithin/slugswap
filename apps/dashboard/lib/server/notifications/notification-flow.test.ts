import assert from "node:assert/strict";
import test from "node:test";
import type { MobileIdentity } from "@/lib/server/mobile-auth";
import {
  registerInstallationWithDependencies,
  unregisterInstallationWithDependencies,
  type NotificationInstallationStore,
} from "./installations";
import {
  notifyDonorSpendWithDependencies,
  type DonorSpendNotificationSenders,
  type DonorSpendNotificationStore,
  type NotificationInstallationRecord,
} from "./donor-spend";
import type { WebPushSubscriptionPayload } from "./web";

const donorIdentity: MobileIdentity = {
  userId: "donor-1",
  email: "donor@example.com",
  name: "Donor Example",
  avatarUrl: null,
};

type EventRecord = {
  id: string;
  claimCodeId: string;
  donorUserId: string;
  amount: number;
  status: string;
  failureReason: string | null;
  sentAt: Date | null;
};

function createFlowHarness() {
  const users = new Map<string, MobileIdentity>();
  const installations = new Map<
    string,
    {
      id: string;
      userId: string;
      installationId: string;
      channel: "expo" | "web";
      platform: "ios" | "android" | "web";
      status: "active" | "inactive" | "invalid";
      expoPushToken: string | null;
      webPushSubscription: WebPushSubscriptionPayload | null;
    }
  >();
  const eventIdsByClaimCode = new Map<string, string>();
  const events = new Map<string, EventRecord>();
  const expoMessages: Array<Record<string, unknown>> = [];
  const webMessages: Array<Record<string, unknown>> = [];

  const installationStore: NotificationInstallationStore = {
    async upsertIdentityUser(identity) {
      users.set(identity.userId, identity);
    },
    async upsertInstallation(input) {
      const existing = installations.get(input.installationId);
      installations.set(input.installationId, {
        id: existing?.id ?? `inst-${input.installationId}`,
        userId: input.userId,
        installationId: input.installationId,
        channel: input.channel,
        platform: input.platform,
        status: "active",
        expoPushToken: input.expoPushToken,
        webPushSubscription: input.webPushSubscription,
      });
    },
    async markInstallationInactive(input) {
      const existing = installations.get(input.installationId);
      if (!existing || existing.userId !== input.userId) return;
      existing.status = "inactive";
    },
  };

  const donorSpendStore: DonorSpendNotificationStore = {
    async createEvent(input) {
      if (!input.donorUserId) return null;
      if (eventIdsByClaimCode.has(input.claimCodeId)) return null;

      const id = `event-${eventIdsByClaimCode.size + 1}`;
      eventIdsByClaimCode.set(input.claimCodeId, id);
      events.set(id, {
        id,
        claimCodeId: input.claimCodeId,
        donorUserId: input.donorUserId,
        amount: input.amount,
        status: "pending",
        failureReason: null,
        sentAt: null,
      });
      return { id };
    },
    async getDonorPreferences(donorUserId) {
      if (!users.has(donorUserId)) return null;
      return { notifyOnSpend: true };
    },
    async listActiveInstallations(donorUserId) {
      const rows = Array.from(installations.values()).filter(
        (installation) =>
          installation.userId === donorUserId && installation.status === "active"
      );

      return rows.map<NotificationInstallationRecord>((installation) => ({
        id: installation.id,
        channel: installation.channel,
        expoPushToken: installation.expoPushToken,
        webPushSubscription: installation.webPushSubscription,
      }));
    },
    async markInstallationStatus(installationId, status) {
      for (const installation of installations.values()) {
        if (installation.id !== installationId) continue;
        installation.status = status as "active" | "inactive" | "invalid";
      }
    },
    async updateEvent(eventId, patch) {
      const event = events.get(eventId);
      if (!event) return;
      event.status = patch.status;
      event.failureReason = patch.failureReason ?? null;
      event.sentAt = patch.sentAt ?? null;
    },
  };

  const senders: DonorSpendNotificationSenders = {
    isLikelyExpoPushToken(token) {
      return token.startsWith("ExpoPushToken[");
    },
    async sendExpoPushNotification(payload) {
      expoMessages.push(payload);
      return { ok: true, errorCode: null, errorMessage: null };
    },
    isValidWebPushSubscription(subscription): subscription is WebPushSubscriptionPayload {
      return Boolean(
        subscription &&
          typeof subscription === "object" &&
          typeof (subscription as WebPushSubscriptionPayload).endpoint === "string"
      );
    },
    async sendWebPushNotification(subscription, payload) {
      webMessages.push({ subscription, payload });
      return {
        ok: true,
        errorCode: null,
        errorMessage: null,
        shouldDeactivate: false,
      };
    },
  };

  return {
    installationStore,
    donorSpendStore,
    senders,
    installations,
    events,
    expoMessages,
    webMessages,
  };
}

test("supports the donor notification lifecycle for a single installation", async () => {
  const harness = createFlowHarness();

  const registerResult = await registerInstallationWithDependencies(
    donorIdentity,
    {
      installationId: "install-ios-1",
      channel: "expo",
      platform: "ios",
      expoPushToken: "ExpoPushToken[lifecycle-1]",
    },
    harness.installationStore,
    {
      webPushEnabled: true,
      webPushPublicKey: "public-key",
      serviceWorkerPath: "/notifications-sw.js",
      serviceWorkerScope: "/app",
    }
  );

  assert.equal(registerResult.ok, true);
  assert.equal(harness.installations.get("install-ios-1")?.status, "active");

  await notifyDonorSpendWithDependencies(
    {
      claimCodeId: "claim-1",
      donorUserId: donorIdentity.userId,
      amount: 42,
    },
    harness.donorSpendStore,
    harness.senders
  );

  assert.equal(harness.expoMessages.length, 1);
  assert.equal(harness.webMessages.length, 0);
  assert.equal(harness.events.get("event-1")?.status, "sent");

  const unregisterResult = await unregisterInstallationWithDependencies(
    donorIdentity,
    "install-ios-1",
    harness.installationStore
  );

  assert.equal(unregisterResult.ok, true);
  assert.equal(harness.installations.get("install-ios-1")?.status, "inactive");

  await notifyDonorSpendWithDependencies(
    {
      claimCodeId: "claim-2",
      donorUserId: donorIdentity.userId,
      amount: 11,
    },
    harness.donorSpendStore,
    harness.senders
  );

  assert.equal(harness.expoMessages.length, 1);
  assert.equal(harness.events.get("event-2")?.status, "skipped");
  assert.equal(
    harness.events.get("event-2")?.failureReason,
    "No active notification installations"
  );
});
