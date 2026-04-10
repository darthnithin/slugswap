import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, lte } from "drizzle-orm";
import {
  authenticateAppUser,
  syncAuthenticatedUser,
} from "@/lib/server/app-user-auth";
import { db } from "@/lib/server/db";
import * as schema from "@/lib/server/schema";
import { getAdminConfig } from "@/lib/server/config";

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
    const auth = await authenticateAppUser(req);
    if ("response" in auth) {
      return auth.response;
    }
    await syncAuthenticatedUser(auth.user);

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

    if (weeklyPool.length === 0) {
      return NextResponse.json({ weeklyLimit: 0, usedAmount: 0, remainingAmount: 0, weekStart: null, weekEnd: null, daysUntilReset: 0 }, { status: 200 });
    }
    const pool = weeklyPool[0];

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

    if (userAllowance.length === 0) {
      const { config } = await getAdminConfig();
      const defaultWeeklyLimit = config.defaultWeeklyAllowance;
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
      userAllowance = [newAllowance];
    }

    const allowance = userAllowance[0];
    const timeUntilReset = pool.weekEnd.getTime() - now.getTime();
    const daysUntilReset = Math.ceil(timeUntilReset / (1000 * 60 * 60 * 24));

    return NextResponse.json(
      {
        weeklyLimit: parseFloat(allowance.weeklyLimit),
        usedAmount: parseFloat(allowance.usedAmount),
        remainingAmount: parseFloat(allowance.remainingAmount),
        weekStart: pool.weekStart.toISOString(),
        weekEnd: pool.weekEnd.toISOString(),
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
