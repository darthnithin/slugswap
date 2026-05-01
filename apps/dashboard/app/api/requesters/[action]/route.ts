import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, gte, lt, lte, sql as sqlOp } from "drizzle-orm";
import {
  authenticateAppUser,
  syncAuthenticatedUser,
} from "@/lib/server/app-user-auth";
import { db } from "@/lib/server/db";
import * as schema from "@/lib/server/schema";
import { getAdminConfig } from "@/lib/server/config";
import { getPacificWeekWindow } from "@/lib/server/timezone";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ action: string }> };
type RequesterPoolStatus = "available" | "empty" | "unavailable";

function durationMs(startedAt: number): number {
  return Date.now() - startedAt;
}

function logApiTiming(label: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.info(label, payload);
}

function parsePoints(value: string | number | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getRequesterPoolStatus(
  claimAmount: number,
  weekStart: Date,
  weekEnd: Date
): Promise<RequesterPoolStatus> {
  const [activeLinkedCap, redeemedThisWeek] = await Promise.all([
    db
      .select({ total: sqlOp<string>`coalesce(sum(${schema.donations.amount}), '0')` })
      .from(schema.donations)
      .innerJoin(
        schema.getCredentials,
        eq(schema.getCredentials.userId, schema.donations.userId)
      )
      .where(eq(schema.donations.status, "active")),
    db
      .select({ total: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')` })
      .from(schema.claimCodes)
      .innerJoin(
        schema.donations,
        eq(schema.claimCodes.donorUserId, schema.donations.userId)
      )
      .innerJoin(
        schema.getCredentials,
        eq(schema.getCredentials.userId, schema.donations.userId)
      )
      .where(
        and(
          eq(schema.donations.status, "active"),
          eq(schema.claimCodes.status, "redeemed"),
          gte(schema.claimCodes.redeemedAt, weekStart),
          lt(schema.claimCodes.redeemedAt, weekEnd)
        )
      ),
  ]);

  const availablePoints =
    parsePoints(activeLinkedCap[0]?.total) - parsePoints(redeemedThisWeek[0]?.total);

  return availablePoints >= claimAmount ? "available" : "empty";
}


async function dispatch(req: NextRequest, ctx: Ctx) {
  const { action } = await ctx.params;
  if (action !== "allowance") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (req.method !== "GET") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const startedAt = Date.now();
  let authMs: number | null = null;
  let syncUserMs: number | null = null;
  let configMs: number | null = null;
  let poolMs: number | null = null;
  let allowanceReadMs: number | null = null;
  let allowanceCreateMs: number | null = null;
  let poolStatusMs: number | null = null;

  try {
    const authStartedAt = Date.now();
    const auth = await authenticateAppUser(req);
    authMs = durationMs(authStartedAt);
    if ("response" in auth) {
      return auth.response;
    }

    const syncStartedAt = Date.now();
    await syncAuthenticatedUser(auth.user);
    syncUserMs = durationMs(syncStartedAt);

    const configStartedAt = Date.now();
    const { config } = await getAdminConfig();
    configMs = durationMs(configStartedAt);

    // const user = auth.user;

    // const { weekStart, weekEnd } = getCurrentWeek();

    // let weeklyPool = await db
    //   .select()
    //   .from(schema.weeklyPools)
    //   .where(eq(schema.weeklyPools.weekStart, weekStart))
    //   .limit(1);

    // if (weeklyPool.length === 0) {
    //   const [newPool] = await db
    //     .insert(schema.weeklyPools)
    //     .values({
    //       weekStart,
    //       weekEnd,
    //       totalAmount: "0",
    //       allocatedAmount: "0",
    //       remainingAmount: "0",
    //     })
    //     .returning();
    //   weeklyPool = [newPool];
    // }

    const user = auth.user;
    const now = new Date();
    // Find the actual pool instead of creating one
    const poolStartedAt = Date.now();
    const weeklyPool = await db
      .select()
      .from(schema.weeklyPools)
      .where(
        and(
          lte(schema.weeklyPools.weekStart, now),
          gt(schema.weeklyPools.weekEnd, now)
        )
      )
      .limit(1);
    poolMs = durationMs(poolStartedAt);

    if (weeklyPool.length === 0) {
      const weekWindow = getPacificWeekWindow(now);
      const poolStatusStartedAt = Date.now();
      const poolStatus = await getRequesterPoolStatus(
        config.defaultClaimAmount,
        weekWindow.weekStart,
        weekWindow.weekEnd
      );
      poolStatusMs = durationMs(poolStatusStartedAt);
      logApiTiming("[api.requesters.allowance.timing]", {
        userId: user.id,
        authMs,
        syncUserMs,
        configMs,
        poolMs,
        allowanceReadMs,
        allowanceCreateMs,
        poolStatusMs,
        hasPool: false,
        totalMs: durationMs(startedAt),
      });
      return NextResponse.json(
        {
          weeklyLimit: 0,
          usedAmount: 0,
          remainingAmount: 0,
          weekStart: null,
          weekEnd: null,
          daysUntilReset: 0,
          poolStatus,
        },
        { status: 200 }
      );
    }
    const pool = weeklyPool[0];

    const allowanceReadStartedAt = Date.now();
    let userAllowance = await db
      .select()
      .from(schema.userAllowances)
      .where(
        and(
          eq(schema.userAllowances.userId, user.id),
          eq(schema.userAllowances.weeklyPoolId, pool.id)
        )
      )
      .limit(1);
    allowanceReadMs = durationMs(allowanceReadStartedAt);

    if (userAllowance.length === 0) {
      const defaultWeeklyLimit = config.defaultWeeklyAllowance;
      const allowanceCreateStartedAt = Date.now();
      const [newAllowance] = await db
        .insert(schema.userAllowances)
        .values({
          userId: user.id,
          weeklyPoolId: pool.id,
          weeklyLimit: defaultWeeklyLimit.toString(),
          usedAmount: "0",
          remainingAmount: defaultWeeklyLimit.toString(),
        })
        .returning();
      allowanceCreateMs = durationMs(allowanceCreateStartedAt);
      userAllowance = [newAllowance];
    }

    const allowance = userAllowance[0];
    const timeUntilReset = pool.weekEnd.getTime() - now.getTime();
    const daysUntilReset = Math.ceil(timeUntilReset / (1000 * 60 * 60 * 24));
    const poolStatusStartedAt = Date.now();
    const poolStatus = await getRequesterPoolStatus(
      config.defaultClaimAmount,
      pool.weekStart,
      pool.weekEnd
    );
    poolStatusMs = durationMs(poolStatusStartedAt);

    logApiTiming("[api.requesters.allowance.timing]", {
      userId: user.id,
      authMs,
      syncUserMs,
      configMs,
      poolMs,
      allowanceReadMs,
      allowanceCreateMs,
      poolStatusMs,
      hasPool: true,
      totalMs: durationMs(startedAt),
    });

    return NextResponse.json(
      {
        weeklyLimit: parseFloat(allowance.weeklyLimit),
        usedAmount: parseFloat(allowance.usedAmount),
        remainingAmount: parseFloat(allowance.remainingAmount),
        weekStart: pool.weekStart.toISOString(),
        weekEnd: pool.weekEnd.toISOString(),
        daysUntilReset,
        poolStatus,
      },
      { status: 200 }
    );
  } catch (error: any) {
    logApiTiming("[api.requesters.allowance.timing]", {
      authMs,
      syncUserMs,
      configMs,
      poolMs,
      allowanceReadMs,
      allowanceCreateMs,
      poolStatusMs,
      totalMs: durationMs(startedAt),
      error: error?.message || "Unknown error",
    });
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
