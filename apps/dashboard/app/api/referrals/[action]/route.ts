import { NextRequest, NextResponse } from "next/server";
import { and, eq, count } from "drizzle-orm";
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

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Omit I, O, 0, 1 (look-alike)
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function ensureReferralCode(userId: string): Promise<string> {
  // Return existing code if already set
  const [user] = await db
    .select({ referralCode: schema.users.referralCode })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (user?.referralCode) {
    return user.referralCode;
  }

  // Generate a unique code
  let code = "";
  let attempts = 0;
  while (attempts < 10) {
    code = generateReferralCode();
    const existing = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.referralCode, code))
      .limit(1);
    if (existing.length === 0) break;
    attempts++;
  }

  await db
    .update(schema.users)
    .set({ referralCode: code, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));

  return code;
}

async function handleGetCode(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { config } = await getAdminConfig();
  const referralCode = await ensureReferralCode(user.id);

  // Count how many users this person has referred
  const [{ referralCount }] = await db
    .select({ referralCount: count() })
    .from(schema.users)
    .where(eq(schema.users.referredBy, user.id));

  // Check if this user has already applied someone else's referral code
  const [currentUser] = await db
    .select({ referredBy: schema.users.referredBy })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1);

  return NextResponse.json({
    referralCode,
    referralCount: Number(referralCount),
    bonusPointsPerReferral: config.referralBonusPoints,
    hasAppliedReferralCode: currentUser?.referredBy != null,
  });
}

async function handleApplyCode(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = await req.json();
  const { referralCode } = body as { referralCode?: string };

  if (!referralCode || typeof referralCode !== "string") {
    return NextResponse.json(
      { error: "referralCode is required" },
      { status: 400 }
    );
  }

  const normalizedCode = referralCode.trim().toUpperCase();

  // Look up the referrer by code
  const [referrer] = await db
    .select({ id: schema.users.id, referralCode: schema.users.referralCode })
    .from(schema.users)
    .where(eq(schema.users.referralCode, normalizedCode))
    .limit(1);

  if (!referrer) {
    return NextResponse.json(
      { error: "Invalid referral code" },
      { status: 404 }
    );
  }

  // Prevent self-referral
  if (referrer.id === user.id) {
    return NextResponse.json(
      { error: "You cannot use your own referral code" },
      { status: 400 }
    );
  }

  // Check if this user has already applied a referral code
  const [currentUser] = await db
    .select({
      referredBy: schema.users.referredBy,
      referralBonusApplied: schema.users.referralBonusApplied,
    })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1);

  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (currentUser.referredBy != null) {
    return NextResponse.json(
      { error: "You have already applied a referral code" },
      { status: 400 }
    );
  }

  const { config } = await getAdminConfig();
  const bonusPoints = config.referralBonusPoints;

  // Mark the applying user as referred, and set bonus-applied flag
  await db
    .update(schema.users)
    .set({
      referredBy: referrer.id,
      referralBonusApplied: true,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, user.id));

  // Credit the referrer's current-week allowance
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

  const poolId = weeklyPool[0].id;

  const referrerAllowance = await db
    .select()
    .from(schema.userAllowances)
    .where(
      and(
        eq(schema.userAllowances.userId, referrer.id),
        eq(schema.userAllowances.weeklyPoolId, poolId)
      )
    )
    .limit(1);

  if (referrerAllowance.length > 0) {
    // Allowance exists — add bonus to both weeklyLimit and remainingAmount
    const existing = referrerAllowance[0];
    const newLimit = parseFloat(existing.weeklyLimit) + bonusPoints;
    const newRemaining = parseFloat(existing.remainingAmount) + bonusPoints;
    await db
      .update(schema.userAllowances)
      .set({
        weeklyLimit: newLimit.toString(),
        remainingAmount: newRemaining.toString(),
        updatedAt: new Date(),
      })
      .where(eq(schema.userAllowances.id, existing.id));
  } else {
    // Referrer has no allowance row yet for this week — create one with the bonus on top
    const defaultWeeklyLimit = config.defaultWeeklyAllowance + bonusPoints;
    await db.insert(schema.userAllowances).values({
      userId: referrer.id,
      weeklyPoolId: poolId,
      weeklyLimit: defaultWeeklyLimit.toString(),
      usedAmount: "0",
      remainingAmount: defaultWeeklyLimit.toString(),
    });
  }

  return NextResponse.json({
    success: true,
    bonusPointsAwarded: bonusPoints,
    message: `Referral applied! Your referrer earned ${bonusPoints} bonus points.`,
  });
}

async function dispatch(req: NextRequest, ctx: Ctx) {
  const { action } = await ctx.params;

  if (req.method === "GET" && action === "code") {
    return handleGetCode(req);
  }

  if (req.method === "POST" && action === "apply") {
    return handleApplyCode(req);
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return dispatch(req, ctx);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return dispatch(req, ctx);
}
