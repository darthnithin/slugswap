import { NextRequest, NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import * as schema from "@/lib/server/schema";
import {
  fetchLiveClaimCodeFromGet,
} from "@/lib/server/claims/get-claim-code";
import { getAdminIdentityFromRequest } from "@/lib/server/admin-auth";
import {
  getDonorUsageForDonor,
  rankDonorCandidatesForClaim,
} from "@/lib/server/claims/donor-selection";
import { getAdminConfig } from "@/lib/server/config";
import { retrieveAccounts, type GetAccount } from "@/lib/server/get/tools";
import { getActiveGetSession } from "@/lib/server/get/session";
import { syncDonorPauseStateFromAccounts } from "@/lib/server/get/tracked-balance";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ action: string }> };
type CheckoutRail = "points-or-bucks" | "flexi-dollars";
type BalanceSnapshotEntry = { id: string; name: string; balance: number | null };
type ClaimGenerationFailureReason =
  | "allowance_exhausted"
  | "pool_exhausted"
  | "pool_unavailable";

const FLEXI_ACCOUNT_NAME = "flexi dollars";
const POINTS_OR_BUCKS_ACCOUNT_NAMES = new Set(["banana bucks", "slug points"]);
const POOL_EXHAUSTED_MESSAGE =
  "Your personal allowance is still there, but the shared pool is empty. Check back later.";
const POOL_UNAVAILABLE_MESSAGE =
  "Points are temporarily unavailable right now. Please try again in a moment.";

function durationMs(startedAt: number): number {
  return Date.now() - startedAt;
}

function logClaimGenerationTiming(payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.info("[claims.generate.timing]", payload);
}

function logClaimCandidateFailure(payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.warn("[claims.generate.candidate-failure]", payload);
}

function claimGenerationErrorResponse(
  error: string,
  status: number,
  reason?: ClaimGenerationFailureReason,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      error,
      ...(reason ? { reason } : {}),
      ...(extra ?? {}),
    },
    { status }
  );
}

function classifyClaimGenerationError(message: string): {
  error: string;
  reason?: ClaimGenerationFailureReason;
  status: number;
} {
  if (message.includes("No eligible donors available under weekly cap limits")) {
    return {
      error: POOL_EXHAUSTED_MESSAGE,
      reason: "pool_exhausted",
      status: 409,
    };
  }

  if (message.includes("No linked donor GET account available")) {
    return {
      error: POOL_EXHAUSTED_MESSAGE,
      reason: "pool_exhausted",
      status: 409,
    };
  }

  return {
    error: message || "Internal server error",
    status: 500,
  };
}

function toTrackedBalanceSnapshot(accounts: GetAccount[]): BalanceSnapshotEntry[] {
  return accounts.map((account) => ({
    id: account.id,
    name: account.accountDisplayName,
    balance: account.balance,
  }));
}

function toSafeBalance(value: number | null): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getAvailableTrackedBalance(
  trackedBalance: number | null
): number | null {
  if (typeof trackedBalance !== "number" || Number.isNaN(trackedBalance)) {
    return null;
  }

  return Math.max(0, trackedBalance);
}

function chooseCheckoutRail(
  snapshot: BalanceSnapshotEntry[],
  claimAmount: number
): CheckoutRail {
  const balances = snapshot.reduce(
    (acc, account) => {
      const normalizedName = account.name.trim().toLowerCase();
      const balance = toSafeBalance(account.balance);
      if (normalizedName === FLEXI_ACCOUNT_NAME) {
        acc.flexi += balance;
      } else if (POINTS_OR_BUCKS_ACCOUNT_NAMES.has(normalizedName)) {
        acc.pointsOrBucks += balance;
      }
      return acc;
    },
    { flexi: 0, pointsOrBucks: 0 }
  );

  const flexiCanCover = balances.flexi >= claimAmount;
  const pointsCanCover = balances.pointsOrBucks >= claimAmount;

  if (flexiCanCover && !pointsCanCover) return "flexi-dollars";
  if (pointsCanCover && !flexiCanCover) return "points-or-bucks";
  if (balances.flexi > balances.pointsOrBucks) return "flexi-dollars";
  return "points-or-bucks";
}

function getRecommendedRailFromBalanceSnapshot(
  balanceSnapshot: string | null,
  claimAmount: number
): CheckoutRail {
  if (!balanceSnapshot) return "points-or-bucks";
  try {
    const parsed = JSON.parse(balanceSnapshot) as BalanceSnapshotEntry[];
    if (!Array.isArray(parsed)) return "points-or-bucks";
    return chooseCheckoutRail(parsed, claimAmount);
  } catch {
    return "points-or-bucks";
  }
}

function formatDonorDisplayName(rawName: string | null): string | null {
  if (!rawName) return null;
  const trimmed = rawName.trim();
  if (!trimmed) return null;

  const firstToken = trimmed.split(/\s+/)[0] ?? "";
  const sanitized = firstToken.replace(/[^A-Za-z0-9'.-]/g, "");
  return sanitized || null;
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

function getSupabaseClient() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase environment variables not configured");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function unauthorizedResponse(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

async function authenticateAppUser(
  req: NextRequest
): Promise<{ user: User } | { response: NextResponse }> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return { response: unauthorizedResponse() };
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return { response: unauthorizedResponse("Invalid token") };
  }

  const supabase = getSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user?.id) {
    return { response: unauthorizedResponse("Invalid token") };
  }

  return { user };
}

async function syncAuthenticatedUser(user: User) {
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
}

async function handleGenerate(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const requestStartedAt = Date.now();

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

    if (!amount) {
      return NextResponse.json({ error: "Missing amount" }, { status: 400 });
    }

    const claimAmount = parseFloat(String(amount));
    if (Number.isNaN(claimAmount) || claimAmount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const requesterStateStartedAt = Date.now();
    const { weekStart } = getCurrentWeek();
    let weeklyPool = await db
      .select()
      .from(schema.weeklyPools)
      .where(eq(schema.weeklyPools.weekStart, weekStart))
      .limit(1);

    if (weeklyPool.length === 0) {
      const { weekEnd } = getCurrentWeek();
      const [newPool] = await db
        .insert(schema.weeklyPools)
        .values({
          weekStart,
          weekEnd,
          totalAmount: "0",
          allocatedAmount: "0",
          remainingAmount: "0",
        })
        .onConflictDoNothing({ target: schema.weeklyPools.weekStart })
        .returning();

      if (newPool) {
        weeklyPool = [newPool];
      } else {
        weeklyPool = await db
          .select()
          .from(schema.weeklyPools)
          .where(eq(schema.weeklyPools.weekStart, weekStart))
          .limit(1);
      }

      if (weeklyPool.length === 0) {
        throw new Error("Failed to load weekly pool");
      }
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
      const { config } = await getAdminConfig();
      const defaultWeeklyLimit = config.defaultWeeklyAllowance;
      const [newAllowance] = await db
        .insert(schema.userAllowances)
        .values({
          userId,
          weeklyPoolId: weeklyPool[0].id,
          weeklyLimit: defaultWeeklyLimit.toString(),
          usedAmount: "0",
          remainingAmount: defaultWeeklyLimit.toString(),
        })
        .returning();
      userAllowance = [newAllowance];
    }

    const allowance = userAllowance[0];
    const remaining = parseFloat(allowance.remainingAmount);
    if (claimAmount > remaining) {
      return claimGenerationErrorResponse(
        "Insufficient allowance",
        400,
        "allowance_exhausted",
        { remaining }
      );
    }

    const requesterStateMs = durationMs(requesterStateStartedAt);
    const rankingStartedAt = Date.now();
    const ranked = await rankDonorCandidatesForClaim(claimAmount);
    const rankingMs = durationMs(rankingStartedAt);
    let hadCapReject = false;
    let hadDepletedBalanceReject = false;
    const fetchFailures: string[] = [];

    for (const [candidateIndex, candidate] of ranked.candidates.entries()) {
      const candidateStartedAt = Date.now();
      // Re-check usage before reserving this donor to reduce race oversubscription.
      const usageStartedAt = Date.now();
      const usage = await getDonorUsageForDonor(
        candidate.donorUserId,
        candidate.weeklyAmount,
        new Date(),
        ranked.weekWindow
      );
      const usageCheckMs = durationMs(usageStartedAt);

      if (usage.remainingThisWeek < claimAmount) {
        hadCapReject = true;
        continue;
      }

      let sessionMs: number | null = null;
      let retrieveAccountsMs: number | null = null;
      let pauseSyncMs: number | null = null;
      let barcodeFetchMs: number | null = null;
      let claimInsertMs: number | null = null;
      let donorProfileMs: number | null = null;

      try {
        const sessionStartedAt = Date.now();
        const { sessionId: donorSessionId } = await getActiveGetSession(
          candidate.donorUserId
        );
        sessionMs = durationMs(sessionStartedAt);
        const accountsStartedAt = Date.now();
        const accounts = await retrieveAccounts(donorSessionId);
        retrieveAccountsMs = durationMs(accountsStartedAt);
        const pauseSyncStartedAt = Date.now();
        const { trackedBalance } = await syncDonorPauseStateFromAccounts(
          candidate.donorUserId,
          accounts
        );
        pauseSyncMs = durationMs(pauseSyncStartedAt);

        const availableTrackedBalance = getAvailableTrackedBalance(trackedBalance);

        if (availableTrackedBalance != null && availableTrackedBalance < claimAmount) {
          hadDepletedBalanceReject = true;
          continue;
        }

        const snapshot = toTrackedBalanceSnapshot(accounts);
        const balanceSnapshot = JSON.stringify(snapshot);
        const recommendedRail = chooseCheckoutRail(snapshot, claimAmount);
        const barcodeStartedAt = Date.now();
        const { code, expiresAt } = await fetchLiveClaimCodeFromGet(
          candidate.donorUserId,
          donorSessionId
        );
        barcodeFetchMs = durationMs(barcodeStartedAt);

        const claimInsertStartedAt = Date.now();
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
        claimInsertMs = durationMs(claimInsertStartedAt);

        const donorProfileStartedAt = Date.now();
        const donorProfile = await db
          .select({ name: schema.users.name })
          .from(schema.users)
          .where(eq(schema.users.id, candidate.donorUserId))
          .limit(1);
        donorProfileMs = durationMs(donorProfileStartedAt);
        const donorDisplayName = formatDonorDisplayName(donorProfile[0]?.name ?? null);

        // Allowance is NOT deducted here — it's only deducted when redemption
        // is confirmed via balance drop (the actual amount spent may differ).

        logClaimGenerationTiming({
          requesterUserId: userId,
          donorUserId: candidate.donorUserId,
          donorSelectionPolicy: ranked.policy,
          candidateIndex: candidateIndex + 1,
          candidateCount: ranked.candidates.length,
          requesterStateMs,
          rankingMs,
          usageCheckMs,
          sessionMs,
          retrieveAccountsMs,
          pauseSyncMs,
          barcodeFetchMs,
          claimInsertMs,
          donorProfileMs,
          candidateTotalMs: durationMs(candidateStartedAt),
          requestTotalMs: durationMs(requestStartedAt),
        });

        return NextResponse.json(
          {
            success: true,
            claimCode: {
              id: claimCode.id,
              code: claimCode.code,
              amount: parseFloat(claimCode.amount),
              expiresAt: claimCode.expiresAt,
              status: claimCode.status,
              recommendedRail,
              donorDisplayName,
            },
          },
          { status: 200 }
        );
      } catch (error: any) {
        logClaimCandidateFailure({
          requesterUserId: userId,
          donorUserId: candidate.donorUserId,
          donorSelectionPolicy: ranked.policy,
          candidateIndex: candidateIndex + 1,
          candidateCount: ranked.candidates.length,
          requesterStateMs,
          rankingMs,
          usageCheckMs,
          sessionMs,
          retrieveAccountsMs,
          pauseSyncMs,
          barcodeFetchMs,
          claimInsertMs,
          donorProfileMs,
          candidateTotalMs: durationMs(candidateStartedAt),
          message: error?.message || "Unknown donor barcode fetch error",
        });
        fetchFailures.push(error?.message || "Unknown donor barcode fetch error");
      }
    }

    if ((hadCapReject || hadDepletedBalanceReject) && fetchFailures.length === 0) {
      return claimGenerationErrorResponse(
        POOL_EXHAUSTED_MESSAGE,
        409,
        "pool_exhausted"
      );
    }

    return claimGenerationErrorResponse(
      POOL_UNAVAILABLE_MESSAGE,
      503,
      "pool_unavailable",
      fetchFailures.length > 0
        ? { upstreamError: `All donor barcode attempts failed: ${fetchFailures[0]}` }
        : undefined
    );
  } catch (error: any) {
    console.error("Error generating claim code:", error);
    logClaimGenerationTiming({
      requestTotalMs: durationMs(requestStartedAt),
      failed: true,
    });
    const message = error?.message || "Internal server error";
    const classified = classifyClaimGenerationError(message);
    return claimGenerationErrorResponse(
      classified.error,
      classified.status,
      classified.reason
    );
  }
}

async function handleHistory(req: NextRequest) {
  if (req.method !== "GET") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const auth = await authenticateAppUser(req);
    if ("response" in auth) {
      return auth.response;
    }
    const userId = auth.user.id;

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
    const auth = await authenticateAppUser(req);
    if ("response" in auth) {
      return auth.response;
    }

    const { claimCodeId } = (await req.json()) as {
      claimCodeId?: string;
    };
    const userId = auth.user.id;

    if (!claimCodeId) {
      return NextResponse.json(
        { error: "Missing claimCodeId" },
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
    const claimAmount = parseFloat(currentClaim.amount);
    const recommendedRail = getRecommendedRailFromBalanceSnapshot(
      currentClaim.balanceSnapshot,
      claimAmount
    );
    if (currentClaim.status !== "active") {
      return NextResponse.json({ error: "Claim code is not active" }, { status: 400 });
    }
    if (currentClaim.expiresAt < new Date()) {
      return NextResponse.json({ error: "Claim code has expired" }, { status: 400 });
    }

    let effectiveDonorUserId = currentClaim.donorUserId;
    if (!effectiveDonorUserId) {
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
          amount: claimAmount,
          expiresAt: currentClaim.expiresAt,
          status: currentClaim.status,
          recommendedRail,
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
    const adminIdentity = getAdminIdentityFromRequest(req);
    const { userId: requestedUserId, claimCodeId } = (await req.json()) as {
      userId?: string;
      claimCodeId?: string;
    };

    if (!claimCodeId) {
      return NextResponse.json(
        { error: "Missing claimCodeId" },
        { status: 400 }
      );
    }

    let userId: string;
    if (adminIdentity) {
      if (!requestedUserId) {
        return NextResponse.json(
          { error: "Missing userId" },
          { status: 400 }
        );
      }
      userId = requestedUserId;
    } else {
      const auth = await authenticateAppUser(req);
      if ("response" in auth) {
        return auth.response;
      }
      userId = auth.user.id;
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
    await syncDonorPauseStateFromAccounts(claim.donorUserId, currentAccounts);
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
    const auth = await authenticateAppUser(req);
    if ("response" in auth) {
      return auth.response;
    }

    const { claimCodeId } = (await req.json()) as {
      claimCodeId?: string;
    };
    const userId = auth.user.id;

    if (!claimCodeId) {
      return NextResponse.json(
        { error: "Missing claimCodeId" },
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
