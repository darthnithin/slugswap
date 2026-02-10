import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import * as schema from "@/lib/server/schema";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ action: string }> };

function getCurrentWeek() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diffToMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  return { weekStart, weekEnd };
}

async function dispatch(req: NextRequest, ctx: Ctx) {
  const { action } = await ctx.params;
  if (action !== "allowance") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (req.method !== "GET") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const userId = new URL(req.url).searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const { weekStart, weekEnd } = getCurrentWeek();

    let weeklyPool = await db
      .select()
      .from(schema.weeklyPools)
      .where(eq(schema.weeklyPools.weekStart, weekStart))
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
          eq(schema.userAllowances.userId, userId),
          eq(schema.userAllowances.weeklyPoolId, weeklyPool[0].id)
        )
      )
      .limit(1);

    if (userAllowance.length === 0) {
      const DEFAULT_WEEKLY_LIMIT = 50;
      const [newAllowance] = await db
        .insert(schema.userAllowances)
        .values({
          userId,
          weeklyPoolId: weeklyPool[0].id,
          weeklyLimit: DEFAULT_WEEKLY_LIMIT.toString(),
          usedAmount: "0",
          remainingAmount: DEFAULT_WEEKLY_LIMIT.toString(),
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
        remainingAmount: parseFloat(allowance.remainingAmount),
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        daysUntilReset,
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
