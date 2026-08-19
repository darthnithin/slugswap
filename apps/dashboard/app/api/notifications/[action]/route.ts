import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import {
  authenticateAppUser,
  syncAuthenticatedUser,
} from "@/lib/server/app-user-auth";
import { db } from "@/lib/server/db";
import * as schema from "@/lib/server/schema";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ action: string }> };
type PushPlatform = "ios" | "android";

function isExpoPushToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]+]$/.test(value) &&
    value.length <= 200
  );
}

function isPushPlatform(value: unknown): value is PushPlatform {
  return value === "ios" || value === "android";
}

async function authenticate(req: NextRequest) {
  const auth = await authenticateAppUser(req);
  if ("response" in auth) return auth;
  await syncAuthenticatedUser(auth.user);
  return auth;
}

async function handleRegister(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const auth = await authenticate(req);
  if ("response" in auth) return auth.response;

  const { token, platform } = (await req.json()) as {
    token?: unknown;
    platform?: unknown;
  };
  if (!isExpoPushToken(token)) {
    return NextResponse.json({ error: "Invalid Expo push token" }, { status: 400 });
  }
  if (!isPushPlatform(platform)) {
    return NextResponse.json({ error: "platform must be ios or android" }, { status: 400 });
  }

  const now = new Date();
  await db
    .insert(schema.pushTokens)
    .values({
      token,
      userId: auth.user.id,
      platform,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.pushTokens.token,
      set: {
        userId: auth.user.id,
        platform,
        enabled: true,
        updatedAt: now,
      },
    });

  return NextResponse.json({ success: true }, { status: 200 });
}

async function handleUnregister(req: NextRequest) {
  if (req.method !== "DELETE") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const auth = await authenticate(req);
  if ("response" in auth) return auth.response;
  const { token } = (await req.json()) as { token?: unknown };
  if (!isExpoPushToken(token)) {
    return NextResponse.json({ error: "Invalid Expo push token" }, { status: 400 });
  }

  await db
    .update(schema.pushTokens)
    .set({ enabled: false, updatedAt: new Date() })
    .where(
      and(
        eq(schema.pushTokens.token, token),
        eq(schema.pushTokens.userId, auth.user.id)
      )
    );

  return NextResponse.json({ success: true }, { status: 200 });
}

async function handlePreference(req: NextRequest) {
  const auth = await authenticate(req);
  if ("response" in auth) return auth.response;

  if (req.method === "GET") {
    const [donation, tokenCount] = await Promise.all([
      db
        .select({ notifyOnSpend: schema.donations.notifyOnSpend })
        .from(schema.donations)
        .where(eq(schema.donations.userId, auth.user.id))
        .limit(1),
      db
        .select({ count: sql<number>`count(*)` })
        .from(schema.pushTokens)
        .where(
          and(
            eq(schema.pushTokens.userId, auth.user.id),
            eq(schema.pushTokens.enabled, true)
          )
        ),
    ]);

    return NextResponse.json(
      {
        notifyOnSpend: donation[0]?.notifyOnSpend ?? false,
        registeredDeviceCount: Number(tokenCount[0]?.count ?? 0),
      },
      { status: 200 }
    );
  }

  if (req.method !== "PATCH") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { enabled } = (await req.json()) as { enabled?: unknown };
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  }

  const [updated] = await db
    .update(schema.donations)
    .set({ notifyOnSpend: enabled, updatedAt: new Date() })
    .where(eq(schema.donations.userId, auth.user.id))
    .returning({ notifyOnSpend: schema.donations.notifyOnSpend });

  if (!updated) {
    return NextResponse.json({ error: "Donation not found" }, { status: 404 });
  }

  return NextResponse.json(
    { success: true, notifyOnSpend: updated.notifyOnSpend },
    { status: 200 }
  );
}

async function dispatch(req: NextRequest, ctx: Ctx) {
  try {
    const { action } = await ctx.params;
    if (action === "register") return handleRegister(req);
    if (action === "unregister") return handleUnregister(req);
    if (action === "preference") return handlePreference(req);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    console.error("Notification API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
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
