import { eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { getCredentials } from "@/lib/server/schema";
import { decryptSecret } from "./credentials";
import { authenticatePin, verifyPin } from "./tools";

export async function getActiveGetSession(
  userId: string
): Promise<{ sessionId: string; deviceId: string }> {
  const credential = await db.query.getCredentials.findFirst({
    where: eq(getCredentials.userId, userId),
  });

  if (!credential) {
    throw new Error("GET account is not linked");
  }

  const pin = decryptSecret(credential.encryptedPin);
  const sessionId = await authenticatePin(pin, credential.deviceId);
  await verifyPin(sessionId, credential.deviceId, pin);

  return { sessionId, deviceId: credential.deviceId };
}
