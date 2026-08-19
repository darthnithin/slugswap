import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, gte, lt, lte, sql as sqlOp } from "drizzle-orm";
import { waitUntil } from "@vercel/functions";
import {
  authenticateAppUser,
  syncAuthenticatedUser,
} from "@/lib/server/app-user-auth";
import { db } from "@/lib/server/db";
import * as schema from "@/lib/server/schema";
import {
  fetchLiveClaimCodeFromGet,
} from "@/lib/server/claims/get-claim-code";
import {
  getDonorUsageForDonor,
  rankDonorCandidatesForClaim,
} from "@/lib/server/claims/donor-selection";
import { getAdminConfig, getEffectiveClaimAmount } from "@/lib/server/config";
import { retrieveAccounts, type GetAccount } from "@/lib/server/get/tools";
import { getActiveGetSession } from "@/lib/server/get/session";
import { syncDonorPauseStateFromAccounts } from "@/lib/server/get/tracked-balance";
import {
  getPacificDayWindow,
} from "@/lib/server/timezone";
import { getOrCreateCurrentWeeklyPool } from "@/lib/server/weekly-pool";
import { runDonorSpendDeliveryPipeline } from "@/lib/server/notifications/donor-spend";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ action: string }> };
type CheckoutRail = "points-or-bucks" | "flexi-dollars";
type BalanceSnapshotEntry = { id: string; name: string; balance: number | null };
type ClaimGenerationFailureReason =
  | "allowance_exhausted"
  | "pool_exhausted"
  | "pool_unavailable";

function scheduleDonorSpendNotification(claimCodeId: string) {
  waitUntil(
    runDonorSpendDeliveryPipeline(claimCodeId).catch((error) => {
      console.error("Donor spend notification pipeline failed", { claimCodeId, error });
    })
  );
}

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

async function activeClaimResponse(
  claim: typeof schema.claimCodes.$inferSelect,
  reused = false
) {
  const donorProfile = claim.donorUserId
    ? await db
        .select({ name: schema.users.name })
        .from(schema.users)
        .where(eq(schema.users.id, claim.donorUserId))
        .limit(1)
    : [];
  const amount = Number(claim.amount);

  return NextResponse.json(
    {
      success: true,
      reused,
      claimCode: {
        id: claim.id,
        code: claim.code,
        amount,
        expiresAt: claim.expiresAt,
        status: claim.status,
        recommendedRail: getRecommendedRailFromBalanceSnapshot(
          claim.balanceSnapshot,
          amount
        ),
        donorDisplayName: formatDonorDisplayName(donorProfile[0]?.name ?? null),
      },
    },
    { status: 200 }
  );
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

    const { amount } = (await req.json().catch(() => ({}))) as {
      amount?: number | string;
    };
    const userId = auth.user.id;
    const { config } = await getAdminConfig();
    const claimCodeTtlMs = config.codeExpiryMinutes * 60_000;

    if (amount !== undefined && (!Number.isFinite(Number(amount)) || Number(amount) <= 0)) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    // The administrator's configured amount is authoritative. Older clients
    // may still send their former hard-coded value, so accept but ignore it.
    const requesterStateStartedAt = Date.now();
    const now = new Date();
    await db
      .update(schema.claimCodes)
      .set({ status: "expired" })
      .where(
        and(
          eq(schema.claimCodes.status, "active"),
          lte(schema.claimCodes.expiresAt, now)
        )
      );

    const existingActiveClaim = await db
      .select()
      .from(schema.claimCodes)
      .where(
        and(
          eq(schema.claimCodes.userId, userId),
          eq(schema.claimCodes.status, "active"),
          gte(schema.claimCodes.expiresAt, now)
        )
      )
      .orderBy(desc(schema.claimCodes.createdAt))
      .limit(1);

    if (existingActiveClaim[0]) {
      return activeClaimResponse(existingActiveClaim[0], true);
    }

    const { dayStart, dayEnd } = getPacificDayWindow(now);
    const claimCountRows = await db
      .select({ count: sqlOp<number>`count(*)::int` })
      .from(schema.claimCodes)
      .where(
        and(
          eq(schema.claimCodes.userId, userId),
          gte(schema.claimCodes.createdAt, dayStart),
          lt(schema.claimCodes.createdAt, dayEnd)
        )
      );
    const claimsToday = Number(claimCountRows[0]?.count ?? 0);
    if (claimsToday >= config.maxClaimsPerDay) {
      return NextResponse.json(
        {
          error: `Daily claim limit reached (${config.maxClaimsPerDay})`,
          reason: "allowance_exhausted",
        },
        { status: 429 }
      );
    }

    const weeklyPool = await getOrCreateCurrentWeeklyPool(now);

    let userAllowance = await db
      .select()
      .from(schema.userAllowances)
      .where(
        and(
          eq(schema.userAllowances.userId, userId),
          eq(schema.userAllowances.weeklyPoolId, weeklyPool.id)
        )
      )
      .limit(1);

    if (userAllowance.length === 0) {
      const defaultWeeklyLimit = config.defaultWeeklyAllowance;
      const [newAllowance] = await db
        .insert(schema.userAllowances)
        .values({
          userId,
          weeklyPoolId: weeklyPool.id,
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
              eq(schema.userAllowances.weeklyPoolId, weeklyPool.id)
            )
          )
          .limit(1);
      }
    }

    if (!userAllowance[0]) {
      throw new Error("Failed to load requester allowance");
    }

    const allowance = userAllowance[0];
    const weeklyLimit = Number(allowance.weeklyLimit);
    const remaining = Number(allowance.remainingAmount);
    if (!Number.isFinite(weeklyLimit) || !Number.isFinite(remaining)) {
      throw new Error("Requester allowance contains invalid amounts");
    }
    if (weeklyLimit < 1 || remaining < 1) {
      return claimGenerationErrorResponse(
        "Insufficient allowance",
        400,
        "allowance_exhausted",
        { remaining: Math.max(0, remaining) }
      );
    }
    const claimAmount = getEffectiveClaimAmount(
      config,
      weeklyLimit
    );
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

        if (availableTrackedBalance == null) {
          fetchFailures.push("Donor tracked balance is unavailable");
          continue;
        }

        if (availableTrackedBalance < claimAmount) {
          hadDepletedBalanceReject = true;
          continue;
        }

        const snapshot = toTrackedBalanceSnapshot(accounts);
        const balanceSnapshot = JSON.stringify(snapshot);
        const recommendedRail = chooseCheckoutRail(snapshot, claimAmount);
        const barcodeStartedAt = Date.now();
        const { code, expiresAt } = await fetchLiveClaimCodeFromGet(
          candidate.donorUserId,
          claimCodeTtlMs,
          donorSessionId
        );
        barcodeFetchMs = durationMs(barcodeStartedAt);

        const claimInsertStartedAt = Date.now();
        const [claimCode] = await db
          .insert(schema.claimCodes)
          .values({
            userId,
            weeklyPoolId: weeklyPool.id,
            donorUserId: candidate.donorUserId,
            code,
            amount: claimAmount.toString(),
            status: "active",
            expiresAt,
            balanceSnapshot,
          })
          .onConflictDoNothing()
          .returning();
        claimInsertMs = durationMs(claimInsertStartedAt);

        if (!claimCode) {
          const concurrentClaim = await db
            .select()
            .from(schema.claimCodes)
            .where(
              and(
                eq(schema.claimCodes.userId, userId),
                eq(schema.claimCodes.status, "active"),
                gte(schema.claimCodes.expiresAt, new Date())
              )
            )
            .orderBy(desc(schema.claimCodes.createdAt))
            .limit(1);

          if (concurrentClaim[0]) {
            return activeClaimResponse(concurrentClaim[0], true);
          }

          // Another requester reserved this donor between ranking and insert.
          continue;
        }

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
            reused: false,
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
        console.error("[claims.generate] donor candidate failed", {
          donorUserId: candidate.donorUserId,
          candidateIndex: candidateIndex + 1,
          candidateCount: ranked.candidates.length,
          message: error?.message || "Unknown error",
        });
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
      fetchFailures.length > 0 ? { attemptsFailed: fetchFailures.length } : undefined
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
      await db
        .update(schema.claimCodes)
        .set({ status: "expired" })
        .where(
          and(
            eq(schema.claimCodes.id, currentClaim.id),
            eq(schema.claimCodes.status, "active")
          )
        );
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
    const { config } = await getAdminConfig();
    const claimCodeTtlMs = config.codeExpiryMinutes * 60_000;
    const { code } = await fetchLiveClaimCodeFromGet(
      effectiveDonorUserId,
      claimCodeTtlMs
    );

    // Do NOT update expiresAt — the original configured expiry window is the hard deadline.
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

    // Fetch the claim to verify ownership and preserve its audit history.
    const claim = await db
      .select()
      .from(schema.claimCodes)
      .where(and(eq(schema.claimCodes.id, claimCodeId), eq(schema.claimCodes.userId, userId)))
      .limit(1);

    if (claim.length === 0) {
      return NextResponse.json({ error: "Claim code not found" }, { status: 404 });
    }

    const currentClaim = claim[0];

    // A live external barcode may remain usable until expiry, so active and
    // redeemed claims are immutable.
    if (currentClaim.status === "active" || currentClaim.status === "redeemed") {
      return NextResponse.json(
        { error: `Cannot remove ${currentClaim.status} claims` },
        { status: 400 }
      );
    }

    // Keep an audit row so daily limits and historical accounting cannot be
    // bypassed by deleting expired attempts.
    await db
      .update(schema.claimCodes)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(schema.claimCodes.id, claimCodeId),
          eq(schema.claimCodes.userId, userId)
        )
      );

    return NextResponse.json(
      {
        success: true,
        message: "Claim archived successfully",
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

  const now = new Date();
  if (claim.status !== "active" || claim.expiresAt <= now) {
    if (claim.status === "active") {
      await db
        .update(schema.claimCodes)
        .set({ status: "expired" })
        .where(
          and(
            eq(schema.claimCodes.id, claim.id),
            eq(schema.claimCodes.status, "active")
          )
        );
    }
    return null;
  }

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

  const positiveDeltas = snapshot.flatMap((snap) => {
    if (snap.balance == null) return [];
    const current = currentAccounts.find((account) => account.id === snap.id);
    if (!current || current.balance == null) return [];

    const amount = snap.balance - current.balance;
    return amount > 0 ? [{ accountId: snap.id, accountName: snap.name, amount }] : [];
  });

  if (positiveDeltas.length === 0) {
    return null;
  }

  const detectedAmount = Number(
    positiveDeltas.reduce((total, entry) => total + entry.amount, 0).toFixed(2)
  );
  const expectedMaximum = Number(claim.amount) + 0.01;

  // Balance polling cannot attribute unrelated donor spending. Restrict a
  // match to this claim's short validity window and configured maximum.
  if (!Number.isFinite(detectedAmount) || detectedAmount <= 0 || detectedAmount > expectedMaximum) {
    console.warn("Ignoring ambiguous donor balance change", {
      claimCodeId: claim.id,
      expectedMaximum,
      detectedAmount,
    });
    return null;
  }

  const primaryAccount = positiveDeltas.reduce((largest, entry) =>
    entry.amount > largest.amount ? entry : largest
  );

  const didRedeem = await db.transaction(async (tx) => {
    const updatedClaims = await tx
      .update(schema.claimCodes)
      .set({
        status: "redeemed",
        redeemedAt: now,
        amount: detectedAmount.toString(),
      })
      .where(
        and(
          eq(schema.claimCodes.id, claim.id),
          eq(schema.claimCodes.status, "active"),
          gte(schema.claimCodes.expiresAt, now)
        )
      )
      .returning({ id: schema.claimCodes.id });

    if (updatedClaims.length === 0) {
      return false;
    }

    await tx.insert(schema.redemptions).values({
      claimCodeId: claim.id,
      userId: claim.userId,
      amount: detectedAmount.toString(),
      redeemedAt: now,
      getToolsTransactionId: `balance_delta:${positiveDeltas
        .map((entry) => entry.accountId)
        .sort()
        .join(",")}`,
    });

    await tx
      .insert(schema.notificationDeliveries)
      .values({
        claimCodeId: claim.id,
        donorUserId: claim.donorUserId!,
        kind: "donor_spend",
        status: "pending",
      })
      .onConflictDoNothing({ target: schema.notificationDeliveries.claimCodeId });

    const userAllowance = await tx
      .select({ id: schema.userAllowances.id })
      .from(schema.userAllowances)
      .where(
        and(
          eq(schema.userAllowances.userId, claim.userId),
          eq(schema.userAllowances.weeklyPoolId, claim.weeklyPoolId)
        )
      )
      .orderBy(asc(schema.userAllowances.createdAt), asc(schema.userAllowances.id))
      .limit(1)
      .for("update");

    if (userAllowance[0]) {
      await tx
        .update(schema.userAllowances)
        .set({
          usedAmount: sqlOp`${schema.userAllowances.usedAmount} + ${detectedAmount}`,
          remainingAmount: sqlOp`greatest(${schema.userAllowances.remainingAmount} - ${detectedAmount}, 0)`,
          updatedAt: now,
        })
        .where(eq(schema.userAllowances.id, userAllowance[0].id));
    }

    return true;
  });

  if (didRedeem) {
    scheduleDonorSpendNotification(claim.id);
  }

  return didRedeem
    ? {
        amount: detectedAmount,
        accountName: primaryAccount.accountName,
        redeemedAt: now,
      }
    : null;
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
      scheduleDonorSpendNotification(currentClaim.id);
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
