import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import * as schema from "@/lib/server/schema";
import {
  fetchLiveClaimCodeFromGet,
} from "@/lib/server/claims/get-claim-code";
import {
  getDonorUsageForDonor,
  rankDonorCandidatesForClaim,
} from "@/lib/server/claims/donor-selection";
import { retrieveAccounts, type GetAccount } from "@/lib/server/get/tools";
import { getActiveGetSession } from "@/lib/server/get/session";

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

    const ranked = await rankDonorCandidatesForClaim(claimAmount);
    let hadCapReject = false;
    const fetchFailures: string[] = [];

    for (const candidate of ranked.candidates) {
      // Re-check usage before reserving this donor to reduce race oversubscription.
      const usage = await getDonorUsageForDonor(
        candidate.donorUserId,
        candidate.weeklyAmount,
        new Date(),
        ranked.weekWindow
      );

      if (usage.remainingThisWeek < claimAmount) {
        hadCapReject = true;
        continue;
      }

      try {
        const { code, expiresAt, sessionId: donorSessionId } =
          await fetchLiveClaimCodeFromGet(candidate.donorUserId);

        let balanceSnapshot: string | null = null;
        try {
          const accounts = await retrieveAccounts(donorSessionId);
          balanceSnapshot = JSON.stringify(
            accounts.map((a) => ({
              id: a.id,
              name: a.accountDisplayName,
              balance: a.balance,
            }))
          );
        } catch (error) {
          console.warn("Failed to snapshot donor balances:", error);
        }

        const [claimCode] = await db
          .insert(schema.claimCodes)
          .values({
            userId,
            weeklyPoolId: weeklyPool[0].id,
            donorUserId: candidate.donorUserId,
            code,
            amount: claimAmount.toString(),
            status: "active",
            expiresAt,
            balanceSnapshot,
          })
          .returning();

        // Allowance is NOT deducted here — it's only deducted when redemption
        // is confirmed via balance drop (the actual amount spent may differ).

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
        fetchFailures.push(error?.message || "Unknown donor barcode fetch error");
      }
    }

    if (hadCapReject && fetchFailures.length === 0) {
      return NextResponse.json(
        { error: "No eligible donors available under weekly cap limits." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error:
          fetchFailures.length > 0
            ? `All donor barcode attempts failed: ${fetchFailures[0]}`
            : "No eligible donors available.",
      },
      { status: 500 }
    );
  } catch (error: any) {
    console.error("Error generating claim code:", error);
    const message = error?.message || "Internal server error";
    const status =
      typeof message === "string" &&
      (message.includes("No eligible donors available") ||
        message.includes("No linked donor GET account available"))
        ? 400
        : 500;
    return NextResponse.json(
      { error: message },
      { status }
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

    // Check for redemption via balance change before refreshing
    const redemptionResult = await detectRedemption(currentClaim);
    if (redemptionResult) {
      return NextResponse.json(
        {
          success: true,
          claimCode: {
            id: currentClaim.id,
            code: currentClaim.code,
            amount: parseFloat(currentClaim.amount),
            expiresAt: currentClaim.expiresAt,
            status: "redeemed",
            redeemedAt: redemptionResult.redeemedAt,
            redemptionAmount: redemptionResult.amount,
            redemptionAccount: redemptionResult.accountName,
          },
        },
        { status: 200 }
      );
    }

    let effectiveDonorUserId = currentClaim.donorUserId;
    if (!effectiveDonorUserId) {
      const claimAmount = parseFloat(currentClaim.amount);
      const ranked = await rankDonorCandidatesForClaim(claimAmount);
      effectiveDonorUserId = ranked.candidates[0]?.donorUserId;
      if (!effectiveDonorUserId) {
        return NextResponse.json(
          { error: "No donor available for legacy claim refresh" },
          { status: 400 }
        );
      }
    }
    const { code } = await fetchLiveClaimCodeFromGet(effectiveDonorUserId);

    // Do NOT update expiresAt — the original 60-second window is the hard deadline.
    // We only fetch a fresh barcode payload (the GET barcode itself is short-lived),
    // but the claim's expiry stays fixed from generation time.

    return NextResponse.json(
      {
        success: true,
        claimCode: {
          id: currentClaim.id,
          code,
          amount: parseFloat(currentClaim.amount),
          expiresAt: currentClaim.expiresAt,
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

type BalanceSnapshotEntry = { id: string; name: string; balance: number | null };

async function detectRedemption(
  claim: typeof schema.claimCodes.$inferSelect
): Promise<{ amount: number; accountName: string; redeemedAt: Date } | null> {
  if (!claim.donorUserId || !claim.balanceSnapshot) return null;

  let snapshot: BalanceSnapshotEntry[];
  try {
    snapshot = JSON.parse(claim.balanceSnapshot) as BalanceSnapshotEntry[];
  } catch {
    return null;
  }

  let currentAccounts: GetAccount[];
  try {
    const { sessionId } = await getActiveGetSession(claim.donorUserId);
    currentAccounts = await retrieveAccounts(sessionId);
  } catch (error) {
    console.warn("Failed to poll donor balances for redemption check:", error);
    return null;
  }

  for (const snap of snapshot) {
    if (snap.balance == null) continue;
    const current = currentAccounts.find((a) => a.id === snap.id);
    if (!current || current.balance == null) continue;

    const delta = snap.balance - current.balance;
    if (delta > 0) {
      const now = new Date();

      await db
        .update(schema.claimCodes)
        .set({ status: "redeemed", redeemedAt: now, amount: delta.toString() })
        .where(eq(schema.claimCodes.id, claim.id));

      await db.insert(schema.redemptions).values({
        claimCodeId: claim.id,
        userId: claim.userId,
        amount: delta.toString(),
        redeemedAt: now,
        getToolsTransactionId: `balance_delta:${snap.id}`,
      });

      // Deduct the actual amount spent from the requester's allowance
      const userAllowance = await db
        .select()
        .from(schema.userAllowances)
        .where(
          and(
            eq(schema.userAllowances.userId, claim.userId),
            eq(schema.userAllowances.weeklyPoolId, claim.weeklyPoolId)
          )
        )
        .limit(1);

      if (userAllowance.length > 0) {
        const allowance = userAllowance[0];
        const remaining = parseFloat(allowance.remainingAmount);
        await db
          .update(schema.userAllowances)
          .set({
            usedAmount: (parseFloat(allowance.usedAmount) + delta).toString(),
            remainingAmount: Math.max(0, remaining - delta).toString(),
            updatedAt: new Date(),
          })
          .where(eq(schema.userAllowances.id, allowance.id));
      }

      return { amount: delta, accountName: snap.name, redeemedAt: now };
    }
  }

  return null;
}

async function handleCheckRedemption(req: NextRequest) {
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
      .where(
        and(
          eq(schema.claimCodes.id, claimCodeId),
          eq(schema.claimCodes.userId, userId)
        )
      )
      .limit(1);

    if (claim.length === 0) {
      return NextResponse.json(
        { error: "Claim code not found" },
        { status: 404 }
      );
    }

    const currentClaim = claim[0];

    if (currentClaim.status === "redeemed") {
      return NextResponse.json(
        { redeemed: true, amount: parseFloat(currentClaim.amount) },
        { status: 200 }
      );
    }

    if (currentClaim.status !== "active") {
      return NextResponse.json({ redeemed: false }, { status: 200 });
    }

    // Try to detect redemption via balance change
    const result = await detectRedemption(currentClaim);
    if (result) {
      return NextResponse.json(
        {
          redeemed: true,
          amount: result.amount,
          accountName: result.accountName,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ redeemed: false }, { status: 200 });
  } catch (error: any) {
    console.error("Error checking redemption:", error);
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
  if (action === "check-redemption") return handleCheckRedemption(req);
  if (action === "delete") return handleDelete(req);
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET(req: NextRequest, ctx: Ctx) { return dispatch(req, ctx); }
export async function POST(req: NextRequest, ctx: Ctx) { return dispatch(req, ctx); }
export async function PATCH(req: NextRequest, ctx: Ctx) { return dispatch(req, ctx); }
export async function DELETE(req: NextRequest, ctx: Ctx) { return dispatch(req, ctx); }
