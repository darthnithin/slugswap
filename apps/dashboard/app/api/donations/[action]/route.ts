import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lt, sql as sqlOp } from "drizzle-orm";
import { db } from "@/lib/server/db";
import * as schema from "@/lib/server/schema";
import {
  authenticateAppUser,
  syncAuthenticatedUser,
} from "@/lib/server/app-user-auth";
import { getAdminConfig } from "@/lib/server/config";
import { fetchLiveTrackedBalance } from "@/lib/server/get/tracked-balance";
import { getPacificWeekWindow } from "@/lib/server/timezone";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ action: string }> };

function durationMs(startedAt: number): number {
  return Date.now() - startedAt;
}

function logApiTiming(label: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.info(label, payload);
}

function isUnlinkedGetAccountError(error: unknown): boolean {
  return error instanceof Error && error.message === "GET account is not linked";
}

async function handleSet(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const auth = await authenticateAppUser(req);
    if ("response" in auth) {
      return auth.response;
    }
    await syncAuthenticatedUser(auth.user);

    const { amount } = (await req.json()) as {
      amount?: number | string;
    };
    const userId = auth.user.id;

    if (amount === undefined || amount === null) {
      return NextResponse.json({ error: "Missing amount" }, { status: 400 });
    }

    const weeklyAmount = Number(String(amount).trim());
    if (!Number.isFinite(weeklyAmount) || weeklyAmount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const { config } = await getAdminConfig();
    if (
      weeklyAmount < config.minDonationAmount ||
      weeklyAmount > config.maxDonationAmount
    ) {
      return NextResponse.json(
        {
          error: `Donation amount must be between ${config.minDonationAmount} and ${config.maxDonationAmount}`,
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const [donation] = await db
      .insert(schema.donations)
      .values({
        userId,
        amount: weeklyAmount.toString(),
        startDate: now,
        status: "active",
      })
      .onConflictDoUpdate({
        target: schema.donations.userId,
        set: {
          amount: weeklyAmount.toString(),
          status: "active",
          updatedAt: now,
        },
      })
      .returning();

    if (!donation) {
      throw new Error("Failed to save donation");
    }

    return NextResponse.json({ success: true, donation }, { status: 200 });
  } catch (error: any) {
    console.error("Error setting donation:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleImpact(req: NextRequest) {
  if (req.method !== "GET") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }
  const startedAt = Date.now();
  let authMs: number | null = null;
  let donationMs: number | null = null;
  let statsMs: number | null = null;
  let liveBalanceMs: number | null = null;

  try {
    const authStartedAt = Date.now();
    const auth = await authenticateAppUser(req);
    authMs = durationMs(authStartedAt);
    if ("response" in auth) {
      return auth.response;
    }
    const userId = auth.user.id;

    const donationStartedAt = Date.now();
    const donations = await db
      .select()
      .from(schema.donations)
      .where(eq(schema.donations.userId, userId))
      .limit(1);
    donationMs = durationMs(donationStartedAt);

    if (donations.length === 0) {
      const weekWindow = getPacificWeekWindow();
      logApiTiming("[api.donations.impact.timing]", {
        userId,
        authMs,
        donationMs,
        statsMs,
        liveBalanceMs,
        hasDonation: false,
        totalMs: durationMs(startedAt),
      });
      return NextResponse.json(
        {
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
        },
        { status: 200 }
      );
    }

    const donation = donations[0];
    const weeklyAmount = parseFloat(donation.amount);
    const now = new Date();
    const weekWindow = getPacificWeekWindow(now);

    const statsStartedAt = Date.now();
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
    statsMs = durationMs(statsStartedAt);

    const redeemedWeekAmount = parseFloat(redeemedThisWeek[0]?.total || "0");
    const reservedWeekAmount = parseFloat(reservedThisWeek[0]?.total || "0");
    const capRemainingThisWeek = Math.max(
      0,
      weeklyAmount - (redeemedWeekAmount + reservedWeekAmount)
    );

    let remainingThisWeek = capRemainingThisWeek;

    if (donation.status === "active") {
      const liveBalanceStartedAt = Date.now();
      try {
        const liveTrackedBalance = await fetchLiveTrackedBalance(userId);
        if (typeof liveTrackedBalance === "number" && !Number.isNaN(liveTrackedBalance)) {
          remainingThisWeek = Math.min(capRemainingThisWeek, Math.max(0, liveTrackedBalance));
        }
      } catch (error) {
        if (!isUnlinkedGetAccountError(error)) {
          console.warn(`Failed to fetch live GET balance for donor ${userId}:`, error);
        }
      } finally {
        liveBalanceMs = durationMs(liveBalanceStartedAt);
      }
    }
    const capReached = remainingThisWeek <= 0;

    logApiTiming("[api.donations.impact.timing]", {
      userId,
      authMs,
      donationMs,
      statsMs,
      liveBalanceMs,
      hasDonation: true,
      status: donation.status,
      totalMs: durationMs(startedAt),
    });

    return NextResponse.json(
      {
        isActive: donation.status === "active",
        weeklyAmount,
        status: donation.status,
        peopleHelped: Number(peopleHelped[0]?.count ?? 0),
        pointsContributed: parseFloat(allTimeContributed[0]?.total || "0"),
        capAmount: weeklyAmount,
        redeemedThisWeek: redeemedWeekAmount,
        reservedThisWeek: reservedWeekAmount,
        remainingThisWeek,
        capReached,
        weekStart: weekWindow.weekStart.toISOString(),
        weekEnd: weekWindow.weekEnd.toISOString(),
        timezone: weekWindow.timezone,
      },
      { status: 200 }
    );
  } catch (error: any) {
    logApiTiming("[api.donations.impact.timing]", {
      authMs,
      donationMs,
      statsMs,
      liveBalanceMs,
      totalMs: durationMs(startedAt),
      error: error?.message || "Unknown error",
    });
    console.error("Error fetching impact:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function handlePause(req: NextRequest) {
  if (req.method !== "PATCH") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }
  try {
    const auth = await authenticateAppUser(req);
    if ("response" in auth) {
      return auth.response;
    }
    await syncAuthenticatedUser(auth.user);

    const { paused } = (await req.json()) as {
      paused?: boolean;
    };
    const userId = auth.user.id;

    if (typeof paused !== "boolean") {
      return NextResponse.json({ error: "paused must be a boolean" }, { status: 400 });
    }

    const newStatus = paused ? "paused" : "active";
    const [updated] = await db
      .update(schema.donations)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(schema.donations.userId, userId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Donation not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, status: updated.status }, { status: 200 });
  } catch (error: any) {
    console.error("Error updating donation status:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function dispatch(req: NextRequest, ctx: Ctx) {
  const { action } = await ctx.params;
  if (action === "set") return handleSet(req);
  if (action === "impact") return handleImpact(req);
  if (action === "pause") return handlePause(req);
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET(req: NextRequest, ctx: Ctx) { return dispatch(req, ctx); }
export async function POST(req: NextRequest, ctx: Ctx) { return dispatch(req, ctx); }
export async function PATCH(req: NextRequest, ctx: Ctx) { return dispatch(req, ctx); }
export async function DELETE(req: NextRequest, ctx: Ctx) { return dispatch(req, ctx); }
