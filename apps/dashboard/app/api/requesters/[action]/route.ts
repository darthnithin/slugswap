import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/server/db";
import * as schema from "@/lib/server/schema";
import { getAdminConfig } from "@/lib/server/config";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ action: string }> };

function getSupabaseClient() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase environment variables not configured");
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

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
    // Verify auth token
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = getSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { weekStart, weekEnd } = getCurrentWeek();

    // Sync user from Supabase Auth to local database
    await db
      .insert(schema.users)
      .values({
        id: user.id,
        email: user.email || `${user.id}@unknown.local`,
        name: user.user_metadata?.name || null,
        avatarUrl: user.user_metadata?.avatar_url || null,
      })
      .onConflictDoUpdate({
        target: schema.users.id,
        set: {
          email: user.email || `${user.id}@unknown.local`,
          name: user.user_metadata?.name || null,
          avatarUrl: user.user_metadata?.avatar_url || null,
          updatedAt: new Date(),
        },
      });

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
          eq(schema.userAllowances.userId, user.id),
          eq(schema.userAllowances.weeklyPoolId, weeklyPool[0].id)
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
          weeklyPoolId: weeklyPool[0].id,
          weeklyLimit: defaultWeeklyLimit.toString(),
          usedAmount: "0",
          remainingAmount: defaultWeeklyLimit.toString(),
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
