import assert from "node:assert/strict";
import test from "node:test";
import type { MobileIdentity } from "@/lib/server/mobile-auth";
import {
  registerInstallationWithDependencies,
  unregisterInstallationWithDependencies,
  type NotificationInstallationStore,
} from "./installations";

const donorIdentity: MobileIdentity = {
  userId: "donor-1",
  email: "donor@example.com",
  name: "Donor Test",
  avatarUrl: null,
};

function createStore() {
  const identityUpserts: MobileIdentity[] = [];
  const installationUpserts: Array<Record<string, unknown>> = [];
  const installationDeactivations: Array<Record<string, unknown>> = [];

  const store: NotificationInstallationStore = {
    async upsertIdentityUser(identity) {
      identityUpserts.push(identity);
    },
    async upsertInstallation(input) {
      installationUpserts.push(input);
    },
    async markInstallationInactive(input) {
      installationDeactivations.push(input);
    },
  };

  return {
    store,
    identityUpserts,
    installationUpserts,
    installationDeactivations,
  };
}

test("registers a native expo installation", async () => {
  const {
    store,
    identityUpserts,
    installationUpserts,
    installationDeactivations,
  } = createStore();

  const result = await registerInstallationWithDependencies(
    donorIdentity,
    {
      installationId: "install-native-1",
      channel: "expo",
      platform: "ios",
      expoPushToken: "ExpoPushToken[abc123]",
    },
    store,
    {
      webPushEnabled: false,
      webPushPublicKey: null,
      serviceWorkerPath: "/notifications-sw.js",
      serviceWorkerScope: "/app",
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.deepEqual(identityUpserts, [donorIdentity]);
  assert.deepEqual(installationUpserts, [
    {
      userId: "donor-1",
      installationId: "install-native-1",
      channel: "expo",
      platform: "ios",
      expoPushToken: "ExpoPushToken[abc123]",
      webPushSubscription: null,
    },
  ]);
  assert.equal(installationDeactivations.length, 0);
});

test("rejects web registration when VAPID config is unavailable", async () => {
  const { store, identityUpserts, installationUpserts } = createStore();

  const result = await registerInstallationWithDependencies(
    donorIdentity,
    {
      installationId: "install-web-1",
      channel: "web",
      platform: "web",
      webPushSubscription: {
        endpoint: "https://push.example.test/subscription",
        expirationTime: null,
        keys: {
          p256dh: "p256dh",
          auth: "auth",
        },
      },
    },
    store,
    {
      webPushEnabled: false,
      webPushPublicKey: null,
      serviceWorkerPath: "/notifications-sw.js",
      serviceWorkerScope: "/app",
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, {
    error: "Web notifications are not configured on the server",
  });
  assert.equal(identityUpserts.length, 0);
  assert.equal(installationUpserts.length, 0);
});

test("registers a web installation when VAPID config exists", async () => {
  const { store, identityUpserts, installationUpserts } = createStore();
  const subscription = {
    endpoint: "https://push.example.test/subscription",
    expirationTime: null,
    keys: {
      p256dh: "p256dh",
      auth: "auth",
    },
  };

  const result = await registerInstallationWithDependencies(
    donorIdentity,
    {
      installationId: "install-web-2",
      channel: "web",
      platform: "web",
      webPushSubscription: subscription,
    },
    store,
    {
      webPushEnabled: true,
      webPushPublicKey: "public-key",
      serviceWorkerPath: "/notifications-sw.js",
      serviceWorkerScope: "/app",
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.deepEqual(identityUpserts, [donorIdentity]);
  assert.deepEqual(installationUpserts, [
    {
      userId: "donor-1",
      installationId: "install-web-2",
      channel: "web",
      platform: "web",
      expoPushToken: null,
      webPushSubscription: subscription,
    },
  ]);
});

test("unregisters an installation for the current donor", async () => {
  const { store, installationDeactivations } = createStore();

  const result = await unregisterInstallationWithDependencies(
    donorIdentity,
    "install-native-1",
    store
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.deepEqual(installationDeactivations, [
    {
      userId: "donor-1",
      installationId: "install-native-1",
    },
  ]);
});
