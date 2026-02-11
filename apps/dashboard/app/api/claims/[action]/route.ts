import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import * as schema from "@/lib/server/schema";
import {
  fetchLiveClaimCodeFromGet,
  resolveLinkedDonorUserId,
} from "@/lib/server/claims/get-claim-code";

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

async function handleGenerate(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { userId, amount } = (await req.json()) as {
      userId?: string;
      amount?: number | string;
    };

    if (!userId || !amount) {
      return NextResponse.json({ error: "Missing userId or amount" }, { status: 400 });
    }

    const claimAmount = parseFloat(String(amount));
    if (Number.isNaN(claimAmount) || claimAmount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const { weekStart } = getCurrentWeek();
    const weeklyPool = await db
      .select()
      .from(schema.weeklyPools)
      .where(eq(schema.weeklyPools.weekStart, weekStart))
      .limit(1);

    if (weeklyPool.length === 0) {
      return NextResponse.json({ error: "No active weekly pool" }, { status: 400 });
    }

    const userAllowance = await db
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
      return NextResponse.json(
        { error: "No allowance found for this week" },
        { status: 400 }
      );
    }

    const allowance = userAllowance[0];
    const remaining = parseFloat(allowance.remainingAmount);
    if (claimAmount > remaining) {
      return NextResponse.json(
        { error: "Insufficient allowance", remaining },
        { status: 400 }
      );
    }

    const donorUserId = await resolveLinkedDonorUserId(db);
    const { code, expiresAt } = await fetchLiveClaimCodeFromGet(donorUserId);

    const [claimCode] = await db
      .insert(schema.claimCodes)
      .values({
        userId,
        weeklyPoolId: weeklyPool[0].id,
        code,
        amount: claimAmount.toString(),
        status: "active",
        expiresAt,
      })
      .returning();

    await db
      .update(schema.userAllowances)
      .set({
        usedAmount: (parseFloat(allowance.usedAmount) + claimAmount).toString(),
        remainingAmount: (remaining - claimAmount).toString(),
        updatedAt: new Date(),
      })
      .where(eq(schema.userAllowances.id, allowance.id));

    return NextResponse.json(
      {
        success: true,
        claimCode: {
          id: claimCode.id,
          code: claimCode.code,
          amount: parseFloat(claimCode.amount),
          expiresAt: claimCode.expiresAt,
          status: claimCode.status,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error generating claim code:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleHistory(req: NextRequest) {
  if (req.method !== "GET") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const userId = new URL(req.url).searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const claimCodes = await db
      .select()
      .from(schema.claimCodes)
      .where(eq(schema.claimCodes.userId, userId))
      .orderBy(desc(schema.claimCodes.createdAt))
      .limit(20);

    const now = new Date();
    const history = claimCodes.map((claim) => ({
      id: claim.id,
      code: claim.code,
      amount: parseFloat(claim.amount),
      status: claim.expiresAt < now && claim.status === "active" ? "expired" : claim.status,
      expiresAt: claim.expiresAt,
      redeemedAt: claim.redeemedAt,
      createdAt: claim.createdAt,
    }));

    return NextResponse.json({ claims: history }, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching claim history:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleRefresh(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { userId, claimCodeId } = (await req.json()) as {
      userId?: string;
      claimCodeId?: string;
    };
    if (!userId || !claimCodeId) {
      return NextResponse.json(
        { error: "Missing userId or claimCodeId" },
        { status: 400 }
      );
    }

    const claim = await db
      .select()
      .from(schema.claimCodes)
      .where(and(eq(schema.claimCodes.id, claimCodeId), eq(schema.claimCodes.userId, userId)))
      .limit(1);

    if (claim.length === 0) {
      return NextResponse.json({ error: "Claim code not found" }, { status: 404 });
    }

    const currentClaim = claim[0];
    if (currentClaim.status !== "active") {
      return NextResponse.json({ error: "Claim code is not active" }, { status: 400 });
    }
    if (currentClaim.expiresAt < new Date()) {
      return NextResponse.json({ error: "Claim code has expired" }, { status: 400 });
    }

    const donorUserId = await resolveLinkedDonorUserId(db);
    const { code, expiresAt } = await fetchLiveClaimCodeFromGet(donorUserId);
    await db
      .update(schema.claimCodes)
      .set({ expiresAt })
      .where(eq(schema.claimCodes.id, currentClaim.id));

    return NextResponse.json(
      {
        success: true,
        claimCode: {
          id: currentClaim.id,
          code,
          amount: parseFloat(currentClaim.amount),
          expiresAt,
          status: currentClaim.status,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error refreshing claim code:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleDelete(req: NextRequest) {
  if (req.method !== "DELETE") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { userId, claimCodeId } = (await req.json()) as {
      userId?: string;
      claimCodeId?: string;
    };

    if (!userId || !claimCodeId) {
      return NextResponse.json(
        { error: "Missing userId or claimCodeId" },
        { status: 400 }
      );
    }

    // Fetch the claim to verify ownership and get amount
    const claim = await db
      .select()
      .from(schema.claimCodes)
      .where(and(eq(schema.claimCodes.id, claimCodeId), eq(schema.claimCodes.userId, userId)))
      .limit(1);

    if (claim.length === 0) {
      return NextResponse.json({ error: "Claim code not found" }, { status: 404 });
    }

    const currentClaim = claim[0];

    // Prevent deleting active or redeemed claims (only allow expired/cancelled)
    if (currentClaim.status === "redeemed") {
      return NextResponse.json(
        { error: "Cannot delete redeemed claims" },
        { status: 400 }
      );
    }

    // If claim is still active, refund the allowance
    if (currentClaim.status === "active" && currentClaim.expiresAt > new Date()) {
      const claimAmount = parseFloat(currentClaim.amount);

      // Find user's allowance for this week
      const userAllowance = await db
        .select()
        .from(schema.userAllowances)
        .where(
          and(
            eq(schema.userAllowances.userId, userId),
            eq(schema.userAllowances.weeklyPoolId, currentClaim.weeklyPoolId)
          )
        )
        .limit(1);

      if (userAllowance.length > 0) {
        const allowance = userAllowance[0];
        const usedAmount = parseFloat(allowance.usedAmount);
        const remainingAmount = parseFloat(allowance.remainingAmount);

        // Refund the points
        await db
          .update(schema.userAllowances)
          .set({
            usedAmount: Math.max(0, usedAmount - claimAmount).toString(),
            remainingAmount: (remainingAmount + claimAmount).toString(),
            updatedAt: new Date(),
          })
          .where(eq(schema.userAllowances.id, allowance.id));
      }
    }

    // Delete the claim
    await db
      .delete(schema.claimCodes)
      .where(eq(schema.claimCodes.id, claimCodeId));

    return NextResponse.json(
      {
        success: true,
        message: "Claim deleted successfully",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error deleting claim:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function dispatch(req: NextRequest, ctx: Ctx) {
  const { action } = await ctx.params;
  if (action === "generate") return handleGenerate(req);
  if (action === "history") return handleHistory(req);
  if (action === "refresh") return handleRefresh(req);
  if (action === "delete") return handleDelete(req);
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET(req: NextRequest, ctx: Ctx) { return dispatch(req, ctx); }
export async function POST(req: NextRequest, ctx: Ctx) { return dispatch(req, ctx); }
export async function PATCH(req: NextRequest, ctx: Ctx) { return dispatch(req, ctx); }
export async function DELETE(req: NextRequest, ctx: Ctx) { return dispatch(req, ctx); }
