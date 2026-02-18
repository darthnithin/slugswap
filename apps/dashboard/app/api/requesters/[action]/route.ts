import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/server/db";
import * as schema from "@/lib/server/schema";
import { getAdminConfig } from "@/lib/server/config";
import { getPacificWeekWindow } from "@/lib/server/timezone";
import { getAdminIdentityFromRequest, resolveRequestIdentity } from "@/lib/server/admin-auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ action: string }> };

async function dispatch(req: NextRequest, ctx: Ctx) {
  const { action } = await ctx.params;
  if (action !== "allowance") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (req.method !== "GET") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const adminIdentity = getAdminIdentityFromRequest(req);

    // Admin can pass ?userId= to look up any user's allowance directly
    const adminOverrideUserId = adminIdentity ? url.searchParams.get("userId") : null;

    let targetUserId: string;

    if (adminOverrideUserId) {
      // Admin querying on behalf of a user — skip user sync, just look up allowance
      targetUserId = adminOverrideUserId;
    } else {
      // Regular user auth — verify token and sync user record
      const identity = await resolveRequestIdentity(req);
      if (!identity) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      targetUserId = identity.userId;

      await db
        .insert(schema.users)
        .values({
          id: identity.userId,
          email: identity.email,
          name: null,
          avatarUrl: null,
        })
        .onConflictDoUpdate({
          target: schema.users.id,
          set: {
            email: identity.email,
            updatedAt: new Date(),
          },
        });
    }

    const { weekStart, weekEnd } = getPacificWeekWindow();
    const currentTime = new Date();

    let weeklyPool = await db
      .select()
      .from(schema.weeklyPools)
      .where(
        and(
          lte(schema.weeklyPools.weekStart, currentTime),
          gte(schema.weeklyPools.weekEnd, currentTime)
        )
      )
      .limit(1);

    if (weeklyPool.length === 0) {
      const [newPool] = await db
        .insert(schema.weeklyPools)
        .values({
          weekStart,
          weekEnd,
          totalAmount: "0",
          allocatedAmount: "0",
          remainingAmount: "0",
        })
        .returning();
      weeklyPool = [newPool];
    }

    let userAllowance = await db
      .select()
      .from(schema.userAllowances)
      .where(
        and(
          eq(schema.userAllowances.userId, targetUserId),
          eq(schema.userAllowances.weeklyPoolId, weeklyPool[0].id)
        )
      )
      .limit(1);

    const { config } = await getAdminConfig();

    if (userAllowance.length === 0) {
      const [newAllowance] = await db
        .insert(schema.userAllowances)
        .values({
          userId: targetUserId,
          weeklyPoolId: weeklyPool[0].id,
          weeklyLimit: config.defaultWeeklyAllowance.toString(),
          usedAmount: "0",
        })
        .returning();
      userAllowance = [newAllowance];
    }

    const allowance = userAllowance[0];
    const now = new Date();
    const timeUntilReset = weekEnd.getTime() - now.getTime();
    const daysUntilReset = Math.ceil(timeUntilReset / (1000 * 60 * 60 * 24));

    return NextResponse.json(
      {
        weeklyLimit: parseFloat(allowance.weeklyLimit),
        usedAmount: parseFloat(allowance.usedAmount),
        remainingAmount: Math.max(0, parseFloat(allowance.weeklyLimit) - parseFloat(allowance.usedAmount)),
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        daysUntilReset,
        defaultClaimAmount: config.defaultClaimAmount,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error fetching allowance:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
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
