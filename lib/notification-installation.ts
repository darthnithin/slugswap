import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const INSTALLATION_ID_KEY = "slugswap.notificationInstallationId";

function generateInstallationId() {
  const cryptoObject = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoObject?.randomUUID) {
    return cryptoObject.randomUUID();
  }

  return `install_${Date.now()}_${Math.random().toString(36).slice(2, 10)}${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export async function getStoredNotificationInstallationId(): Promise<string | null> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(INSTALLATION_ID_KEY);
  }

  return AsyncStorage.getItem(INSTALLATION_ID_KEY);
}

export async function getOrCreateNotificationInstallationId(): Promise<string> {
  const existing = await getStoredNotificationInstallationId();
  if (existing) return existing;

  const nextId = generateInstallationId();
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(INSTALLATION_ID_KEY, nextId);
    }
    return nextId;
  }

  await AsyncStorage.setItem(INSTALLATION_ID_KEY, nextId);
  return nextId;
}
