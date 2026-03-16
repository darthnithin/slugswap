import assert from "node:assert/strict";
import test from "node:test";
import {
  notifyDonorSpendWithDependencies,
  sendUserAdminNotificationWithDependencies,
  sendUserTestNotificationWithDependencies,
  type DonorSpendNotificationSenders,
  type DonorSpendNotificationStore,
  type NotificationInstallationRecord,
} from "./donor-spend";
import type { WebPushSubscriptionPayload } from "./web";

type TestStoreState = {
  createEventResult?: { id: string } | null;
  donorPreferences?: { notifyOnSpend: boolean } | null;
  activeInstallations?: NotificationInstallationRecord[];
};

function createStore(state: TestStoreState = {}) {
  const eventPatches: Array<{ eventId: string; patch: Record<string, unknown> }> = [];
  const installationStatuses: Array<{ installationId: string; status: string }> = [];

  const store: DonorSpendNotificationStore = {
    async createEvent() {
      return state.createEventResult === undefined
        ? { id: "event-1" }
        : state.createEventResult;
    },
    async getDonorPreferences() {
      return state.donorPreferences === undefined
        ? { notifyOnSpend: true }
        : state.donorPreferences;
    },
    async listActiveInstallations() {
      return state.activeInstallations ?? [];
    },
    async markInstallationStatus(installationId, status) {
      installationStatuses.push({ installationId, status });
    },
    async updateEvent(eventId, patch) {
      eventPatches.push({ eventId, patch });
    },
  };

  return { store, eventPatches, installationStatuses };
}

function createSenders() {
  const expoPayloads: Array<Record<string, unknown>> = [];
  const webPayloads: Array<Record<string, unknown>> = [];

  const senders: DonorSpendNotificationSenders = {
    isLikelyExpoPushToken(token) {
      return token.startsWith("ExpoPushToken[");
    },
    async sendExpoPushNotification(payload) {
      expoPayloads.push(payload);
      return { ok: true, errorCode: null, errorMessage: null };
    },
    isValidWebPushSubscription(
      subscription: unknown
    ): subscription is WebPushSubscriptionPayload {
      if (!subscription || typeof subscription !== "object") return false;
      const candidate = subscription as WebPushSubscriptionPayload;
      return (
        typeof candidate.endpoint === "string" &&
        typeof candidate.keys?.p256dh === "string" &&
        typeof candidate.keys?.auth === "string"
      );
    },
    async sendWebPushNotification(subscription, payload) {
      webPayloads.push({ subscription, payload });
      return {
        ok: true,
        errorCode: null,
        errorMessage: null,
        shouldDeactivate: false,
      };
    },
  };

  return { senders, expoPayloads, webPayloads };
}

test("skips notification when donor notifications are disabled", async () => {
  const { store, eventPatches } = createStore({
    donorPreferences: { notifyOnSpend: false },
  });
  const { senders, expoPayloads, webPayloads } = createSenders();

  await notifyDonorSpendWithDependencies(
    {
      claimCodeId: "claim-1",
      donorUserId: "donor-1",
      amount: 25,
    },
    store,
    senders
  );

  assert.equal(expoPayloads.length, 0);
  assert.equal(webPayloads.length, 0);
  assert.deepEqual(eventPatches, [
    {
      eventId: "event-1",
      patch: {
        status: "skipped",
        failureReason: "Donor notifications disabled",
      },
    },
  ]);
});

test("marks invalid expo installations and still succeeds when another installation is deliverable", async () => {
  const { store, eventPatches, installationStatuses } = createStore({
    activeInstallations: [
      {
        id: "expo-bad",
        channel: "expo",
        expoPushToken: "not-a-real-token",
        webPushSubscription: null,
      },
      {
        id: "web-good",
        channel: "web",
        expoPushToken: null,
        webPushSubscription: {
          endpoint: "https://push.example.test/subscription",
          expirationTime: null,
          keys: {
            p256dh: "p256dh",
            auth: "auth",
          },
        },
      },
    ],
  });
  const { senders, expoPayloads, webPayloads } = createSenders();

  await notifyDonorSpendWithDependencies(
    {
      claimCodeId: "claim-2",
      donorUserId: "donor-2",
      amount: 15,
    },
    store,
    senders
  );

  assert.equal(expoPayloads.length, 0);
  assert.equal(webPayloads.length, 1);
  assert.deepEqual(installationStatuses, [
    { installationId: "expo-bad", status: "invalid" },
  ]);
  assert.equal(eventPatches.length, 1);
  assert.equal(eventPatches[0]?.eventId, "event-1");
  assert.equal(eventPatches[0]?.patch.status, "sent");
  assert.equal(eventPatches[0]?.patch.failureReason, null);
  assert.ok(eventPatches[0]?.patch.sentAt instanceof Date);
});

test("invalidates expired web subscriptions and fails event when all deliveries fail", async () => {
  const { store, eventPatches, installationStatuses } = createStore({
    activeInstallations: [
      {
        id: "web-expired",
        channel: "web",
        expoPushToken: null,
        webPushSubscription: {
          endpoint: "https://push.example.test/expired",
          expirationTime: null,
          keys: {
            p256dh: "p256dh",
            auth: "auth",
          },
        },
      },
    ],
  });
  const { senders } = createSenders();
  senders.sendWebPushNotification = async () => ({
    ok: false,
    errorCode: "SubscriptionExpired",
    errorMessage: "Gone",
    shouldDeactivate: true,
  });

  await notifyDonorSpendWithDependencies(
    {
      claimCodeId: "claim-3",
      donorUserId: "donor-3",
      amount: 7.5,
    },
    store,
    senders
  );

  assert.deepEqual(installationStatuses, [
    { installationId: "web-expired", status: "invalid" },
  ]);
  assert.deepEqual(eventPatches, [
    {
      eventId: "event-1",
      patch: {
        status: "failed",
        failureReason: "Gone",
      },
    },
  ]);
});

test("returns early when the claim already has a notification event", async () => {
  const { store, eventPatches, installationStatuses } = createStore({
    createEventResult: null,
  });
  const { senders, expoPayloads, webPayloads } = createSenders();

  await notifyDonorSpendWithDependencies(
    {
      claimCodeId: "claim-4",
      donorUserId: "donor-4",
      amount: 10,
    },
    store,
    senders
  );

  assert.equal(expoPayloads.length, 0);
  assert.equal(webPayloads.length, 0);
  assert.equal(eventPatches.length, 0);
  assert.equal(installationStatuses.length, 0);
});

test("sends an admin test notification to active installations", async () => {
  const { store, installationStatuses } = createStore({
    activeInstallations: [
      {
        id: "expo-good",
        channel: "expo",
        expoPushToken: "ExpoPushToken[test-token]",
        webPushSubscription: null,
      },
      {
        id: "web-good",
        channel: "web",
        expoPushToken: null,
        webPushSubscription: {
          endpoint: "https://push.example.test/subscription",
          expirationTime: null,
          keys: {
            p256dh: "p256dh",
            auth: "auth",
          },
        },
      },
    ],
  });
  const { senders, expoPayloads, webPayloads } = createSenders();

  const result = await sendUserTestNotificationWithDependencies(
    {
      userId: "user-1",
      adminEmail: "admin@example.com",
    },
    store,
    senders
  );

  assert.deepEqual(result, {
    ok: true,
    successCount: 2,
    totalInstallations: 2,
    error: null,
  });
  assert.equal(installationStatuses.length, 0);
  assert.equal(expoPayloads.length, 1);
  assert.equal(webPayloads.length, 1);
  assert.equal(expoPayloads[0]?.title, "SlugSwap test notification");
  assert.equal(expoPayloads[0]?.body, "Triggered from the admin panel by admin@example.com.");
  assert.equal((webPayloads[0]?.payload as Record<string, unknown>).eventType, "admin_test_notification");
});

test("fails admin test notification cleanly when user has no active installations", async () => {
  const { store, installationStatuses } = createStore({
    activeInstallations: [],
  });
  const { senders, expoPayloads, webPayloads } = createSenders();

  const result = await sendUserTestNotificationWithDependencies(
    {
      userId: "user-2",
    },
    store,
    senders
  );

  assert.deepEqual(result, {
    ok: false,
    successCount: 0,
    totalInstallations: 0,
    error: "No active notification installations",
  });
  assert.equal(installationStatuses.length, 0);
  assert.equal(expoPayloads.length, 0);
  assert.equal(webPayloads.length, 0);
});

test("sends a custom admin notification payload", async () => {
  const { store } = createStore({
    activeInstallations: [
      {
        id: "expo-good",
        channel: "expo",
        expoPushToken: "ExpoPushToken[custom-token]",
        webPushSubscription: null,
      },
    ],
  });
  const { senders, expoPayloads } = createSenders();

  const result = await sendUserAdminNotificationWithDependencies(
    {
      userId: "user-3",
      title: "Pool update",
      body: "Dinner service is extra busy tonight, claim early.",
      adminEmail: "admin@example.com",
      eventType: "admin_notification",
    },
    store,
    senders
  );

  assert.deepEqual(result, {
    ok: true,
    successCount: 1,
    totalInstallations: 1,
    error: null,
  });
  assert.equal(expoPayloads[0]?.title, "Pool update");
  assert.equal(
    expoPayloads[0]?.body,
    "Dinner service is extra busy tonight, claim early."
  );
  assert.equal(
    (expoPayloads[0]?.data as Record<string, unknown>).eventType,
    "admin_notification"
  );
  assert.equal(
    (expoPayloads[0]?.data as Record<string, unknown>).triggeredBy,
    "admin@example.com"
  );
});
