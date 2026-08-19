import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/server/db";
import {
  authenticateAppUser,
  syncAuthenticatedUser,
} from "@/lib/server/app-user-auth";
import { getCredentials, users, donations } from "@/lib/server/schema";
import { decryptSecret, encryptSecret } from "@/lib/server/get/credentials";
import {
  authenticatePin,
  callGetApi,
  createPin,
  extractValidatedSessionId,
  generateDeviceId,
  retrieveAccounts,
  retrievePatronBarcodePayload,
  revokePin,
  verifyPin,
} from "@/lib/server/get/tools";
import { getActiveGetSession } from "@/lib/server/get/session";
import { syncDonorPauseStateFromAccounts } from "@/lib/server/get/tracked-balance";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ action: string }> };

import type { GetAccount } from "@/lib/server/get/tools";

const GET_LINK_CHANGED_ERROR =
  "GET account link changed while this request was running. Please retry.";

function durationMs(startedAt: number): number {
  return Date.now() - startedAt;
}

function logApiTiming(label: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.info(label, payload);
}

function formatGetLinkError(error: any): { status: number; message: string } {
  const cause = error?.cause;
  const code = cause?.code as string | undefined;
  const constraint = cause?.constraint as string | undefined;
  const message = error?.message as string | undefined;

  if (message === "Missing user email for first-time setup") {
    return { status: 400, message: "Missing account email. Please sign in again and retry." };
  }

  if (message?.startsWith("Account sync issue:")) {
    return { status: 409, message };
  }

  if (message === GET_LINK_CHANGED_ERROR) {
    return { status: 409, message };
  }

  if (code === "23503" && constraint === "get_credentials_user_id_users_id_fk") {
    return {
      status: 409,
      message:
        "Account sync issue: your profile could not be matched in our database. Please sign out and sign back in, then try linking again.",
    };
  }

  return {
    status: 500,
    message: "Unable to link GET account right now. Please try again.",
  };
}

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

  const syncedById = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (syncedById) return;

  const existingByEmail = await db.query.users.findFirst({
    where: eq(users.email, userEmail),
  });

  if (existingByEmail && existingByEmail.id !== userId) {
    throw new Error(
      "Account sync issue: this email is linked to a different internal user record."
    );
  }

  throw new Error("Account sync issue: unable to initialize your user profile.");
}

function generatePin(): string {
  return randomInt(0, 10_000).toString().padStart(4, "0");
}

async function bestEffortRevokePin(input: {
  pin: string;
  deviceId: string;
  sessionId?: string | null;
  context: string;
}) {
  try {
    const sessionId = input.sessionId || (await authenticatePin(input.pin, input.deviceId));
    await revokePin(sessionId, input.deviceId);
  } catch (error) {
    console.warn(`Failed to revoke ${input.context} GET credential:`, error);
  }
}

async function dispatch(req: NextRequest, ctx: Ctx) {
  const { action } = await ctx.params;

  if (action === "login-url") {
    if (req.method !== "GET") {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }
    const loginUrl = process.env.GET_LOGIN_URL;
    if (!loginUrl) {
      return NextResponse.json({ error: "GET_LOGIN_URL is not configured" }, { status: 400 });
    }
    return NextResponse.json({ loginUrl }, { status: 200 });
  }

  if (action === "link-status") {
    if (req.method !== "GET") {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }
    const startedAt = Date.now();
    let authMs: number | null = null;
    let credentialMs: number | null = null;

    try {
      const authStartedAt = Date.now();
      const auth = await authenticateAppUser(req);
      authMs = durationMs(authStartedAt);
      if ("response" in auth) {
        return auth.response;
      }

      const credentialStartedAt = Date.now();
      const [credential] = await db
        .select({ linkedAt: getCredentials.linkedAt })
        .from(getCredentials)
        .where(eq(getCredentials.userId, auth.user.id))
        .limit(1);
      credentialMs = durationMs(credentialStartedAt);

      logApiTiming("[api.get.link-status.timing]", {
        userId: auth.user.id,
        authMs,
        credentialMs,
        totalMs: durationMs(startedAt),
      });

      return NextResponse.json(
        {
          linked: !!credential,
          linkedAt: credential?.linkedAt ?? null,
        },
        { status: 200 }
      );
    } catch (error: any) {
      logApiTiming("[api.get.link-status.timing]", {
        authMs,
        credentialMs,
        totalMs: durationMs(startedAt),
        error: error?.message || "Unknown error",
      });
      console.error("Error checking GET link status:", error);
      return NextResponse.json(
        { error: error?.message || "Internal server error" },
        { status: 500 }
      );
    }
  }

  if (action === "accounts") {
    if (req.method !== "GET") {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }
    const startedAt = Date.now();
    let userId: string | null = null;
    let authMs: number | null = null;
    let syncUserMs: number | null = null;
    let sessionMs: number | null = null;
    let retrieveAccountsMs: number | null = null;
    let pauseSyncMs: number | null = null;

    try {
      const authStartedAt = Date.now();
      const auth = await authenticateAppUser(req);
      authMs = durationMs(authStartedAt);
      if ("response" in auth) {
        logApiTiming("[api.get.accounts.timing]", {
          authMs,
          totalMs: durationMs(startedAt),
          shortCircuit: "auth",
        });
        return auth.response;
      }
      userId = auth.user.id;

      const syncUserStartedAt = Date.now();
      await syncAuthenticatedUser(auth.user);
      syncUserMs = durationMs(syncUserStartedAt);

      const sessionStartedAt = Date.now();
      const { sessionId } = await getActiveGetSession(auth.user.id);
      sessionMs = durationMs(sessionStartedAt);
      const retrieveAccountsStartedAt = Date.now();
      const accounts = await retrieveAccounts(sessionId);
      retrieveAccountsMs = durationMs(retrieveAccountsStartedAt);
      const pauseSyncStartedAt = Date.now();
      await syncDonorPauseStateFromAccounts(auth.user.id, accounts);
      pauseSyncMs = durationMs(pauseSyncStartedAt);

      logApiTiming("[api.get.accounts.timing]", {
        userId,
        authMs,
        syncUserMs,
        sessionMs,
        retrieveAccountsMs,
        pauseSyncMs,
        totalMs: durationMs(startedAt),
      });

      return NextResponse.json(
        { linked: true, accounts },
        { status: 200 }
      );
    } catch (error: any) {
      logApiTiming("[api.get.accounts.timing]", {
        userId,
        authMs,
        syncUserMs,
        sessionMs,
        retrieveAccountsMs,
        pauseSyncMs,
        totalMs: durationMs(startedAt),
        error: error?.message || "Unknown error",
      });
      const message = error?.message || "Failed to retrieve GET accounts";
      const status = message.includes("not linked") ? 400 : 500;
      return NextResponse.json({ error: message }, { status });
    }
  }

  if (action === "wallet") {
    if (req.method !== "GET") {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }
    try {
      const auth = await authenticateAppUser(req);
      if ("response" in auth) {
        return auth.response;
      }
      await syncAuthenticatedUser(auth.user);

      const { sessionId } = await getActiveGetSession(auth.user.id);
      const accounts = await retrieveAccounts(sessionId);
      await syncDonorPauseStateFromAccounts(auth.user.id, accounts);
      const code = await retrievePatronBarcodePayload(sessionId);

      return NextResponse.json(
        {
          linked: true,
          accounts,
          barcode: { code, fetchedAt: new Date().toISOString() },
        },
        { status: 200 }
      );
    } catch (error: any) {
      const message = error?.message || "Failed to retrieve GET wallet";
      const status = message.includes("not linked") ? 400 : 500;
      return NextResponse.json({ error: message }, { status });
    }
  }

  if (action === "barcode") {
    if (req.method !== "GET") {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }
    try {
      const auth = await authenticateAppUser(req);
      if ("response" in auth) {
        return auth.response;
      }
      await syncAuthenticatedUser(auth.user);

      const { sessionId } = await getActiveGetSession(auth.user.id);
      const code = await retrievePatronBarcodePayload(sessionId);

      return NextResponse.json(
        { linked: true, code, fetchedAt: new Date().toISOString() },
        { status: 200 }
      );
    } catch (error: any) {
      const message = error?.message || "Failed to retrieve GET barcode";
      const status = message.includes("not linked") ? 400 : 500;
      return NextResponse.json({ error: message }, { status });
    }
  }

  if (action === "link") {
    if (req.method !== "POST" && req.method !== "DELETE") {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
      if (req.method === "POST") {
        const auth = await authenticateAppUser(req);
        if ("response" in auth) {
          return auth.response;
        }
        await syncAuthenticatedUser(auth.user);

        const { validatedUrl } = (await req.json()) as {
          validatedUrl?: string;
        };
        const userId = auth.user.id;

        if (!validatedUrl) {
          return NextResponse.json(
            { error: "Missing or invalid validatedUrl" },
            { status: 400 }
          );
        }

        await ensureUserExists(userId, auth.user.email);

        const validatedSessionId = extractValidatedSessionId(validatedUrl);
        if (!validatedSessionId) {
          return NextResponse.json(
            { error: "Could not extract validated GET session id from provided URL" },
            { status: 400 }
          );
        }

        const existingCredential = await db.query.getCredentials.findFirst({
          where: eq(getCredentials.userId, userId),
        });
        const safePin = generatePin();
        const deviceId = generateDeviceId();
        let apiSessionId: string | null = null;
        let provisionAttempted = false;
        let storedNewCredential = false;
        let storageAttempted = false;
        let storageConfirmedNotWritten = false;

        try {
          provisionAttempted = true;
          await createPin(validatedSessionId, deviceId, safePin);
          apiSessionId = await authenticatePin(safePin, deviceId);
          await verifyPin(apiSessionId, deviceId, safePin);

          const now = new Date();
          const encryptedPin = encryptSecret(safePin);
          storageAttempted = true;
          const [storedCredential] = existingCredential
            ? await db
                .update(getCredentials)
                .set({
                  deviceId,
                  encryptedPin,
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(getCredentials.userId, userId),
                    eq(getCredentials.deviceId, existingCredential.deviceId)
                  )
                )
                .returning({ deviceId: getCredentials.deviceId })
            : await db
                .insert(getCredentials)
                .values({
                  userId,
                  deviceId,
                  encryptedPin,
                })
                .onConflictDoNothing({ target: getCredentials.userId })
                .returning({ deviceId: getCredentials.deviceId });

          if (!storedCredential) {
            storageConfirmedNotWritten = true;
            throw new Error(GET_LINK_CHANGED_ERROR);
          }
          storedNewCredential = true;
        } catch (error) {
          if (
            !storedNewCredential &&
            storageAttempted &&
            !storageConfirmedNotWritten
          ) {
            try {
              const currentCredential = await db.query.getCredentials.findFirst({
                where: eq(getCredentials.userId, userId),
              });
              storedNewCredential = currentCredential?.deviceId === deviceId;
              storageConfirmedNotWritten = !storedNewCredential;
            } catch (confirmationError) {
              console.warn("Failed to confirm GET credential storage after link error:", confirmationError);
            }
          }

          if (!storedNewCredential) {
            if (
              provisionAttempted &&
              (!storageAttempted || storageConfirmedNotWritten)
            ) {
              await bestEffortRevokePin({
                pin: safePin,
                deviceId,
                sessionId: apiSessionId,
                context: "newly provisioned",
              });
            } else if (provisionAttempted) {
              console.warn(
                "GET credential storage outcome is unknown; leaving the new PIN active to avoid breaking a possibly committed link"
              );
            }
            throw error;
          }

          console.warn("GET credential storage reported an error but the new credential is active:", error);
        }

        if (existingCredential && existingCredential.deviceId !== deviceId) {
          try {
            const previousPin = decryptSecret(existingCredential.encryptedPin);
            await bestEffortRevokePin({
              pin: previousPin,
              deviceId: existingCredential.deviceId,
              context: "previous",
            });
          } catch (error) {
            console.warn("Failed to decrypt previous GET credential for revocation:", error);
          }
        }

        return NextResponse.json({ success: true, linked: true }, { status: 200 });
      }

      const auth = await authenticateAppUser(req);
      if ("response" in auth) {
        return auth.response;
      }
      await syncAuthenticatedUser(auth.user);
      const userId = auth.user.id;

      const credential = await db.query.getCredentials.findFirst({
        where: eq(getCredentials.userId, userId),
      });

      if (!credential) {
        await db
          .update(donations)
          .set({ status: "paused", updatedAt: new Date() })
          .where(
            and(
              eq(donations.userId, userId),
              eq(donations.status, "active")
            )
          );
        return NextResponse.json({ success: true, linked: false }, { status: 200 });
      }

      try {
        const pin = decryptSecret(credential.encryptedPin);
        const sessionId = await authenticatePin(pin, credential.deviceId);
        await revokePin(sessionId, credential.deviceId);
      } catch (error) {
        console.warn("GET unlink revoke failed:", error);
      }

      const unlinked = await db.transaction(async (tx) => {
        const [deletedCredential] = await tx
          .delete(getCredentials)
          .where(
            and(
              eq(getCredentials.userId, userId),
              eq(getCredentials.deviceId, credential.deviceId),
              eq(getCredentials.encryptedPin, credential.encryptedPin)
            )
          )
          .returning({ deviceId: getCredentials.deviceId });

        if (!deletedCredential) {
          return false;
        }

        await tx
          .update(donations)
          .set({ status: "paused", updatedAt: new Date() })
          .where(
            and(
              eq(donations.userId, userId),
              eq(donations.status, "active")
            )
          );

        return true;
      });

      if (!unlinked) {
        return NextResponse.json(
          { error: GET_LINK_CHANGED_ERROR },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true, linked: false }, { status: 200 });
    } catch (error: any) {
      const { status, message } = formatGetLinkError(error);
      console.error("Error handling GET link:", {
        message: error?.message,
        cause: error?.cause,
      });
      return NextResponse.json({ error: message }, { status });
    }
  }

  if (!action) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return dispatch(req, ctx);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return dispatch(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return dispatch(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return dispatch(req, ctx);
}
