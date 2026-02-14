import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { getCredentials, users } from "@/lib/server/schema";
import { decryptSecret, encryptSecret } from "@/lib/server/get/credentials";
import {
  authenticatePin,
  callGetApi,
  createPin,
  extractValidatedSessionId,
  generateDeviceId,
  revokePin,
  verifyPin,
} from "@/lib/server/get/tools";
import { getActiveGetSession } from "@/lib/server/get/session";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ action: string }> };

type GetAccount = {
  id: string;
  accountDisplayName: string;
  isActive: boolean;
  isAccountTenderActive: boolean;
  depositAccepted: boolean;
  balance: number | null;
};

type RetrieveAccountsResponse =
  | GetAccount[]
  | {
      accounts?: GetAccount[];
      planName?: string;
    };

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
  return Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
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
    try {
      const userId = new URL(req.url).searchParams.get("userId");
      if (!userId) {
        return NextResponse.json({ error: "Missing userId" }, { status: 400 });
      }

      const credential = await db.query.getCredentials.findFirst({
        where: eq(getCredentials.userId, userId),
      });

      return NextResponse.json(
        {
          linked: !!credential,
          linkedAt: credential?.linkedAt ?? null,
        },
        { status: 200 }
      );
    } catch (error: any) {
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
    try {
      const userId = new URL(req.url).searchParams.get("userId");
      if (!userId) {
        return NextResponse.json({ error: "Missing userId" }, { status: 400 });
      }

      const { sessionId } = await getActiveGetSession(userId);
      const retrieveAccountsResponse = await callGetApi<
        { sessionId: string },
        RetrieveAccountsResponse
      >("commerce", "retrieveAccounts", { sessionId });

      const normalizedAccounts = Array.isArray(retrieveAccountsResponse)
        ? retrieveAccountsResponse
        : Array.isArray(retrieveAccountsResponse?.accounts)
          ? retrieveAccountsResponse.accounts
          : [];

      return NextResponse.json(
        {
          linked: true,
          accounts: normalizedAccounts,
          planName:
            !Array.isArray(retrieveAccountsResponse) &&
            typeof retrieveAccountsResponse?.planName === "string"
              ? retrieveAccountsResponse.planName
              : null,
        },
        { status: 200 }
      );
    } catch (error: any) {
      const message = error?.message || "Failed to retrieve GET accounts";
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
        const { userId, userEmail, validatedUrl } = (await req.json()) as {
          userId?: string;
          userEmail?: string | null;
          validatedUrl?: string;
        };

        if (!userId || !validatedUrl) {
          return NextResponse.json(
            { error: "Missing or invalid userId or validatedUrl" },
            { status: 400 }
          );
        }

        const safePin = generatePin();
        await ensureUserExists(userId, userEmail);

        const validatedSessionId = extractValidatedSessionId(validatedUrl);
        if (!validatedSessionId) {
          return NextResponse.json(
            { error: "Could not extract validated GET session id from provided URL" },
            { status: 400 }
          );
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

        return NextResponse.json({ success: true, linked: true }, { status: 200 });
      }

      const userId = new URL(req.url).searchParams.get("userId");
      if (!userId) {
        return NextResponse.json({ error: "Missing userId" }, { status: 400 });
      }

      const credential = await db.query.getCredentials.findFirst({
        where: eq(getCredentials.userId, userId),
      });

      if (!credential) {
        return NextResponse.json({ success: true, linked: false }, { status: 200 });
      }

      try {
        const pin = decryptSecret(credential.encryptedPin);
        const sessionId = await authenticatePin(pin, credential.deviceId);
        await revokePin(sessionId, credential.deviceId);
      } catch (error) {
        console.warn("GET unlink revoke failed:", error);
      }

      await db.delete(getCredentials).where(eq(getCredentials.userId, userId));
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
