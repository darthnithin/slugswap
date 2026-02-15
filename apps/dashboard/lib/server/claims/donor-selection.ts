import { eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { donations, getCredentials } from "@/lib/server/schema";
import {
  getDonorWeeklyUsageMap,
  type DonorWeeklyUsage,
} from "@/lib/server/claims/donor-usage";
import { getActiveGetSession } from "@/lib/server/get/session";
import { retrieveAccounts, type GetAccount } from "@/lib/server/get/tools";
import { getAdminConfig, type DonorSelectionPolicy } from "@/lib/server/config";
import { type WeekWindow } from "@/lib/server/timezone";

const TRACKED_BALANCE_ACCOUNT_NAMES = new Set([
  "flexi dollars",
  "banana bucks",
  "slug points",
]);

export type RankedDonorCandidate = {
  donorUserId: string;
  weeklyAmount: number;
  usage: DonorWeeklyUsage;
  liveTrackedBalance: number | null;
};

export type RankedDonorSelection = {
  candidates: RankedDonorCandidate[];
  policy: DonorSelectionPolicy;
  weekWindow: WeekWindow;
};

function parsePoints(value: string | number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function trackedBalanceTotal(accounts: GetAccount[]): number | null {
  const tracked = accounts.filter((account) =>
    TRACKED_BALANCE_ACCOUNT_NAMES.has(account.accountDisplayName.trim().toLowerCase())
  );

  let total = 0;
  let found = false;
  for (const account of tracked) {
    if (typeof account.balance !== "number" || Number.isNaN(account.balance)) continue;
    total += account.balance;
    found = true;
  }

  return found ? total : null;
}

async function fetchLiveTrackedBalance(donorUserId: string): Promise<number | null> {
  try {
    const { sessionId } = await getActiveGetSession(donorUserId);
    const accounts = await retrieveAccounts(sessionId);
    return trackedBalanceTotal(accounts);
  } catch (error) {
    console.warn(`Failed to retrieve live balance for donor ${donorUserId}:`, error);
    return null;
  }
}

function roundRobinSort(a: RankedDonorCandidate, b: RankedDonorCandidate): number {
  const aTime = a.usage.lastSelectedAt?.getTime() ?? 0;
  const bTime = b.usage.lastSelectedAt?.getTime() ?? 0;
  if (aTime !== bTime) return aTime - bTime;
  return a.donorUserId.localeCompare(b.donorUserId);
}

function weightedRoundRobinSort(a: RankedDonorCandidate, b: RankedDonorCandidate): number {
  const aScore = (a.usage.claimsSelectedThisWeek + 1) / Math.max(1, a.weeklyAmount);
  const bScore = (b.usage.claimsSelectedThisWeek + 1) / Math.max(1, b.weeklyAmount);
  if (aScore !== bScore) return aScore - bScore;
  return roundRobinSort(a, b);
}

function leastUtilizedSort(a: RankedDonorCandidate, b: RankedDonorCandidate): number {
  if (a.usage.utilizationRatio !== b.usage.utilizationRatio) {
    return a.usage.utilizationRatio - b.usage.utilizationRatio;
  }
  return roundRobinSort(a, b);
}

function highestBalanceSort(a: RankedDonorCandidate, b: RankedDonorCandidate): number {
  const aBalance = a.liveTrackedBalance ?? Number.NEGATIVE_INFINITY;
  const bBalance = b.liveTrackedBalance ?? Number.NEGATIVE_INFINITY;
  if (aBalance !== bBalance) return bBalance - aBalance;
  return leastUtilizedSort(a, b);
}

export async function rankDonorCandidatesForClaim(
  claimAmount: number
): Promise<RankedDonorSelection> {
  const now = new Date();
  const [{ config }, donorRows] = await Promise.all([
    getAdminConfig(),
    db
      .select({
        donorUserId: donations.userId,
        weeklyAmount: donations.amount,
      })
      .from(donations)
      .innerJoin(getCredentials, eq(getCredentials.userId, donations.userId))
      .where(eq(donations.status, "active")),
  ]);

  if (donorRows.length === 0) {
    throw new Error(
      "No linked donor GET account available. Ask a donor to link GET in Share tab."
    );
  }

  const donorCaps = donorRows.map((row) => ({
    donorUserId: row.donorUserId,
    capAmount: parsePoints(row.weeklyAmount),
  }));

  const { usageMap, weekWindow } = await getDonorWeeklyUsageMap(donorCaps, now);

  let candidates: RankedDonorCandidate[] = donorRows
    .map((row) => {
      const weeklyAmount = parsePoints(row.weeklyAmount);
      const usage = usageMap.get(row.donorUserId);
      if (!usage) return null;
      return {
        donorUserId: row.donorUserId,
        weeklyAmount,
        usage,
        liveTrackedBalance: null,
      } as RankedDonorCandidate;
    })
    .filter((candidate): candidate is RankedDonorCandidate => !!candidate)
    .filter((candidate) => candidate.usage.remainingThisWeek >= claimAmount);

  if (candidates.length === 0) {
    throw new Error("No eligible donors available under weekly cap limits.");
  }

  const policy = config.donorSelectionPolicy;

  if (policy === "round_robin") {
    candidates.sort(roundRobinSort);
  } else if (policy === "weighted_round_robin") {
    candidates.sort(weightedRoundRobinSort);
  } else if (policy === "least_utilized") {
    candidates.sort(leastUtilizedSort);
  } else {
    const withBalances = await Promise.all(
      candidates.map(async (candidate) => ({
        ...candidate,
        liveTrackedBalance: await fetchLiveTrackedBalance(candidate.donorUserId),
      }))
    );

    const hasLiveBalance = withBalances.some(
      (candidate) => typeof candidate.liveTrackedBalance === "number"
    );

    candidates = withBalances;
    if (hasLiveBalance) {
      candidates.sort(highestBalanceSort);
    } else {
      candidates.sort(leastUtilizedSort);
    }
  }

  return {
    candidates,
    policy,
    weekWindow,
  };
}

export async function getDonorUsageForDonor(
  donorUserId: string,
  capAmount: number,
  now = new Date(),
  weekWindow?: WeekWindow
): Promise<DonorWeeklyUsage> {
  const { usageMap } = await getDonorWeeklyUsageMap(
    [{ donorUserId, capAmount }],
    now,
    weekWindow
  );

  const usage = usageMap.get(donorUserId);
  if (!usage) {
    throw new Error(`Donor usage missing for ${donorUserId}`);
  }
  return usage;
}
