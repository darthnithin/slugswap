import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { getCredentials, users } from "../../db/schema";
import { decryptSecret, encryptSecret } from "./_lib/credentials";
import {
  authenticatePin,
  createPin,
  extractValidatedSessionId,
  generateDeviceId,
  revokePin,
  verifyPin,
} from "./_lib/get-tools";

async function ensureUserExists(userId: string, userEmail?: string | null) {
  const existing = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (existing) return;
  if (!userEmail || typeof userEmail !== "string") {
    throw new Error("Missing user email for first-time setup");
  }

  await db
    .insert(users)
    .values({
      id: userId,
      email: userEmail,
    })
    .onConflictDoNothing();
}

function generatePin(): string {
  return Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (req.method === "POST") {
      const { userId, userEmail, validatedUrl } = req.body as {
        userId?: string;
        userEmail?: string | null;
        validatedUrl?: string;
      };

      if (!userId || !validatedUrl) {
        return res
          .status(400)
          .json({ error: "Missing or invalid userId or validatedUrl" });
      }
      const safeValidatedUrl = validatedUrl;
      const safePin = generatePin();

      await ensureUserExists(userId, userEmail);

      const validatedSessionId = extractValidatedSessionId(safeValidatedUrl);
      if (!validatedSessionId) {
        return res.status(400).json({
          error: "Could not extract validated GET session id from provided URL",
        });
      }

      const deviceId = generateDeviceId();
      await createPin(validatedSessionId, deviceId, safePin);
      const apiSessionId = await authenticatePin(safePin, deviceId);
      await verifyPin(apiSessionId, deviceId, safePin);

      await db
        .insert(getCredentials)
        .values({
          userId,
          deviceId,
          encryptedPin: encryptSecret(safePin),
        })
        .onConflictDoUpdate({
          target: getCredentials.userId,
          set: {
            deviceId,
            encryptedPin: encryptSecret(safePin),
            updatedAt: new Date(),
          },
        });

      return res.status(200).json({
        success: true,
        linked: true,
      });
    }

    // DELETE /api/get/link?userId=...
    const userId = req.query.userId;
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "Missing userId" });
    }

    const credential = await db.query.getCredentials.findFirst({
      where: eq(getCredentials.userId, userId),
    });

    if (!credential) {
      return res.status(200).json({ success: true, linked: false });
    }

    try {
      const pin = decryptSecret(credential.encryptedPin);
      const sessionId = await authenticatePin(pin, credential.deviceId);
      await revokePin(sessionId, credential.deviceId);
    } catch (error) {
      // Continue cleanup even if remote revoke fails.
      console.warn("GET unlink revoke failed:", error);
    }

    await db.delete(getCredentials).where(eq(getCredentials.userId, userId));
    return res.status(200).json({ success: true, linked: false });
  } catch (error: any) {
    console.error("Error handling GET link:", error);
    return res.status(500).json({ error: error?.message || "Internal server error" });
  }
}
