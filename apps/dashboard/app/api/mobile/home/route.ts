import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lt, sql as sqlOp } from "drizzle-orm";
import {
  authenticateAppUser,
  syncAuthenticatedUser,
} from "@/lib/server/app-user-auth";
import {
  getAdminConfig,
  getEffectiveClaimAmount,
  type AdminConfig,
} from "@/lib/server/config";
import { db } from "@/lib/server/db";
import { fetchLiveTrackedBalance } from "@/lib/server/get/tracked-balance";
import * as schema from "@/lib/server/schema";
import { getPacificWeekWindow } from "@/lib/server/timezone";
import { getOrCreateCurrentWeeklyPool } from "@/lib/server/weekly-pool";

export const runtime = "nodejs";

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

function isUnlinkedGetAccountError(error: unknown): boolean {
  return error instanceof Error && error.message === "GET account is not linked";
}

function emptyImpact() {
  const weekWindow = getPacificWeekWindow();
  return {
    isActive: false,
    weeklyAmount: 0,
    status: "paused",
    peopleHelped: 0,
    pointsContributed: 0,
    capAmount: 0,
    redeemedThisWeek: 0,
    reservedThisWeek: 0,
    remainingThisWeek: 0,
    capReached: false,
    weekStart: weekWindow.weekStart.toISOString(),
    weekEnd: weekWindow.weekEnd.toISOString(),
    timezone: weekWindow.timezone,
  };
}

function unavailableAllowance() {
  return {
    weeklyLimit: 0,
    usedAmount: 0,
    remainingAmount: 0,
    weekStart: null,
    weekEnd: null,
    daysUntilReset: 0,
    poolStatus: "unavailable" as const,
  };
}

async function getRequesterPoolStatus(
  claimAmount: number,
  weekStart: Date,
  weekEnd: Date
): Promise<RequesterPoolStatus> {
  const now = new Date();
  const [activeLinkedCap, redeemedThisWeek, reservedThisWeek] = await Promise.all([
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
          eq(schema.claimCodes.status, "active"),
          gte(schema.claimCodes.createdAt, weekStart),
          lt(schema.claimCodes.createdAt, weekEnd),
          gte(schema.claimCodes.expiresAt, now)
        )
      ),
  ]);

  const availablePoints =
    parsePoints(activeLinkedCap[0]?.total) -
    parsePoints(redeemedThisWeek[0]?.total) -
    parsePoints(reservedThisWeek[0]?.total);

  return availablePoints >= claimAmount ? "available" : "empty";
}

async function getAllowanceForUser(
  userId: string,
  config: AdminConfig,
  ensureUserExists?: () => Promise<void>
) {
  const now = new Date();
  const pool = await getOrCreateCurrentWeeklyPool(now);
  let userAllowance = await db
    .select()
    .from(schema.userAllowances)
    .where(
      and(
        eq(schema.userAllowances.userId, userId),
        eq(schema.userAllowances.weeklyPoolId, pool.id)
      )
    )
    .limit(1);

  if (userAllowance.length === 0) {
    await ensureUserExists?.();
    const defaultWeeklyLimit = config.defaultWeeklyAllowance;
    const [newAllowance] = await db
      .insert(schema.userAllowances)
      .values({
        userId,
        weeklyPoolId: pool.id,
        weeklyLimit: defaultWeeklyLimit.toString(),
        usedAmount: "0",
        remainingAmount: defaultWeeklyLimit.toString(),
      })
      .onConflictDoNothing({
        target: [
          schema.userAllowances.userId,
          schema.userAllowances.weeklyPoolId,
        ],
      })
      .returning();
    if (newAllowance) {
      userAllowance = [newAllowance];
    } else {
      userAllowance = await db
        .select()
        .from(schema.userAllowances)
        .where(
          and(
            eq(schema.userAllowances.userId, userId),
            eq(schema.userAllowances.weeklyPoolId, pool.id)
          )
        )
        .limit(1);
    }
  }

  const allowance = userAllowance[0];
  if (!allowance) {
    throw new Error("Failed to load requester allowance");
  }
  const timeUntilReset = pool.weekEnd.getTime() - now.getTime();
  const daysUntilReset = Math.ceil(timeUntilReset / (1000 * 60 * 60 * 24));
  const weeklyLimit = parsePoints(allowance.weeklyLimit);
  const poolStatus =
    weeklyLimit < 1
      ? "empty"
      : await getRequesterPoolStatus(
          getEffectiveClaimAmount(config, weeklyLimit),
          pool.weekStart,
          pool.weekEnd
        );

  return {
    weeklyLimit,
    usedAmount: parseFloat(allowance.usedAmount),
    remainingAmount: parseFloat(allowance.remainingAmount),
    weekStart: pool.weekStart.toISOString(),
    weekEnd: pool.weekEnd.toISOString(),
    daysUntilReset,
    poolStatus,
  };
}

async function getImpactForUser(userId: string) {
  const donations = await db
    .select()
    .from(schema.donations)
    .where(eq(schema.donations.userId, userId))
    .limit(1);

  if (donations.length === 0) {
    return emptyImpact();
  }

  const donation = donations[0];
  const weeklyAmount = parseFloat(donation.amount);
  const now = new Date();
  const weekWindow = getPacificWeekWindow(now);

  const [peopleHelped, allTimeContributed, redeemedThisWeek, reservedThisWeek] =
    await Promise.all([
      db
        .select({ count: sqlOp<number>`count(distinct ${schema.claimCodes.userId})` })
        .from(schema.claimCodes)
        .where(
          and(
            eq(schema.claimCodes.status, "redeemed"),
            eq(schema.claimCodes.donorUserId, userId)
          )
        ),
      db
        .select({ total: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')` })
        .from(schema.claimCodes)
        .where(
          and(
            eq(schema.claimCodes.status, "redeemed"),
            eq(schema.claimCodes.donorUserId, userId)
          )
        ),
      db
        .select({ total: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')` })
        .from(schema.claimCodes)
        .where(
          and(
            eq(schema.claimCodes.status, "redeemed"),
            eq(schema.claimCodes.donorUserId, userId),
            gte(schema.claimCodes.redeemedAt, weekWindow.weekStart),
            lt(schema.claimCodes.redeemedAt, weekWindow.weekEnd)
          )
        ),
      db
        .select({ total: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')` })
        .from(schema.claimCodes)
        .where(
          and(
            eq(schema.claimCodes.status, "active"),
            eq(schema.claimCodes.donorUserId, userId),
            gte(schema.claimCodes.createdAt, weekWindow.weekStart),
            lt(schema.claimCodes.createdAt, weekWindow.weekEnd),
            gte(schema.claimCodes.expiresAt, now)
          )
        ),
    ]);

  const redeemedWeekAmount = parseFloat(redeemedThisWeek[0]?.total || "0");
  const reservedWeekAmount = parseFloat(reservedThisWeek[0]?.total || "0");
  const capRemainingThisWeek = Math.max(
    0,
    weeklyAmount - (redeemedWeekAmount + reservedWeekAmount)
  );

  let remainingThisWeek = capRemainingThisWeek;
  if (donation.status === "active") {
    try {
      const liveTrackedBalance = await fetchLiveTrackedBalance(userId);
      if (typeof liveTrackedBalance === "number" && !Number.isNaN(liveTrackedBalance)) {
        remainingThisWeek = Math.min(capRemainingThisWeek, Math.max(0, liveTrackedBalance));
      }
    } catch (error) {
      if (!isUnlinkedGetAccountError(error)) {
        console.warn(`Failed to fetch live GET balance for donor ${userId}:`, error);
      }
    }
  }

  return {
    isActive: donation.status === "active",
    weeklyAmount,
    status: donation.status,
    peopleHelped: Number(peopleHelped[0]?.count ?? 0),
    pointsContributed: parseFloat(allTimeContributed[0]?.total || "0"),
    capAmount: weeklyAmount,
    redeemedThisWeek: redeemedWeekAmount,
    reservedThisWeek: reservedWeekAmount,
    remainingThisWeek,
    capReached: remainingThisWeek <= 0,
    weekStart: weekWindow.weekStart.toISOString(),
    weekEnd: weekWindow.weekEnd.toISOString(),
    timezone: weekWindow.timezone,
  };
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  let authMs: number | null = null;
  let bootstrapMs: number | null = null;
  let payloadMs: number | null = null;

  try {
    const authStartedAt = Date.now();
    const auth = await authenticateAppUser(req);
    authMs = durationMs(authStartedAt);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.user.id;
    const bootstrapStartedAt = Date.now();
    const [credential, { config }] = await Promise.all([
      db
        .select({ linkedAt: schema.getCredentials.linkedAt })
        .from(schema.getCredentials)
        .where(eq(schema.getCredentials.userId, userId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      getAdminConfig(),
    ]);
    bootstrapMs = durationMs(bootstrapStartedAt);

    const linked = !!credential;
    const payloadStartedAt = Date.now();
    const [impact, allowance] = await Promise.all([
      linked ? getImpactForUser(userId) : Promise.resolve(emptyImpact()),
      getAllowanceForUser(userId, config, () => syncAuthenticatedUser(auth.user)).catch((error) => {
        console.warn(`Failed to load allowance for mobile home ${userId}:`, error);
        return unavailableAllowance();
      }),
    ]);
    payloadMs = durationMs(payloadStartedAt);

    logApiTiming("[api.mobile.home.timing]", {
      userId,
      authMs,
      bootstrapMs,
      payloadMs,
      linked,
      totalMs: durationMs(startedAt),
    });

    return NextResponse.json(
      {
        user: {
          id: userId,
          email: auth.user.email ?? null,
          fullName:
            typeof auth.user.user_metadata?.full_name === "string"
              ? auth.user.user_metadata.full_name
              : null,
        },
        linkStatus: {
          linked,
          linkedAt: credential?.linkedAt ?? null,
        },
        impact,
        allowance,
      },
      { status: 200 }
    );
  } catch (error: any) {
    logApiTiming("[api.mobile.home.timing]", {
      authMs,
      bootstrapMs,
      payloadMs,
      totalMs: durationMs(startedAt),
      error: error?.message || "Unknown error",
    });
    console.error("Error loading mobile home:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
