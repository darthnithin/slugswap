import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lt, sql as sqlOp } from "drizzle-orm";
import { db } from "@/lib/server/db";
import * as schema from "@/lib/server/schema";
import { getPacificWeekWindow } from "@/lib/server/timezone";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ action: string }> };

async function handleSet(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { userId, amount, userEmail } = (await req.json()) as {
      userId?: string;
      amount?: number | string;
      userEmail?: string | null;
    };

    if (!userId || amount === undefined || amount === null) {
      return NextResponse.json({ error: "Missing userId or amount" }, { status: 400 });
    }

    const weeklyAmount = parseFloat(String(amount));
    if (Number.isNaN(weeklyAmount) || weeklyAmount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const existingUsers = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (existingUsers.length === 0) {
      if (!userEmail || typeof userEmail !== "string") {
        return NextResponse.json(
          { error: "Missing user email for first-time donor setup" },
          { status: 400 }
        );
      }
      await db
        .insert(schema.users)
        .values({ id: userId, email: userEmail })
        .onConflictDoNothing();
    }

    const existingDonations = await db
      .select()
      .from(schema.donations)
      .where(eq(schema.donations.userId, userId))
      .limit(1);

    let donation;
    if (existingDonations.length > 0) {
      const [updated] = await db
        .update(schema.donations)
        .set({
          amount: weeklyAmount.toString(),
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(schema.donations.id, existingDonations[0].id))
        .returning();
      donation = updated;
    } else {
      const [created] = await db
        .insert(schema.donations)
        .values({
          userId,
          amount: weeklyAmount.toString(),
          startDate: new Date(),
          status: "active",
        })
        .returning();
      donation = created;
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
  try {
    const userId = new URL(req.url).searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const donations = await db
      .select()
      .from(schema.donations)
      .where(eq(schema.donations.userId, userId))
      .limit(1);

    if (donations.length === 0) {
      const weekWindow = getPacificWeekWindow();
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
    const remainingThisWeek = weeklyAmount - (redeemedWeekAmount + reservedWeekAmount);

    return NextResponse.json(
      {
        isActive: donation.status === "active",
        weeklyAmount,
        status: donation.status,
        peopleHelped: peopleHelped[0]?.count || 0,
        pointsContributed: parseFloat(allTimeContributed[0]?.total || "0"),
        capAmount: weeklyAmount,
        redeemedThisWeek: redeemedWeekAmount,
        reservedThisWeek: reservedWeekAmount,
        remainingThisWeek,
        capReached: remainingThisWeek <= 0,
        weekStart: weekWindow.weekStart.toISOString(),
        weekEnd: weekWindow.weekEnd.toISOString(),
        timezone: weekWindow.timezone,
      },
      { status: 200 }
    );
  } catch (error: any) {
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
    const { userId, paused } = (await req.json()) as {
      userId?: string;
      paused?: boolean;
    };
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
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
