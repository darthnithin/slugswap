import { eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { getCredentials } from "@/lib/server/schema";
import { decryptSecret } from "./credentials";
import { authenticatePin } from "./tools";

function durationMs(startedAt: number): number {
  return Date.now() - startedAt;
}

function logGetSessionTiming(payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.info("[get.session.timing]", payload);
}

export async function getActiveGetSession(
  userId: string
): Promise<{ sessionId: string; deviceId: string }> {
  const startedAt = Date.now();
  const credentialStartedAt = Date.now();
  const credential = await db.query.getCredentials.findFirst({
    where: eq(getCredentials.userId, userId),
  });
  const credentialMs = durationMs(credentialStartedAt);

  if (!credential) {
    throw new Error("GET account is not linked");
  }

  const decryptStartedAt = Date.now();
  const pin = decryptSecret(credential.encryptedPin);
  const decryptMs = durationMs(decryptStartedAt);
  const authStartedAt = Date.now();
  const sessionId = await authenticatePin(pin, credential.deviceId);
  const authenticateMs = durationMs(authStartedAt);

  logGetSessionTiming({
    userId,
    credentialMs,
    decryptMs,
    authenticateMs,
    totalMs: durationMs(startedAt),
  });

  return { sessionId, deviceId: credential.deviceId };
}
