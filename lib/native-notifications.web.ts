export async function registerNativePushToken(): Promise<never> {
  throw new Error('Native push notifications are unavailable on web.');
}
