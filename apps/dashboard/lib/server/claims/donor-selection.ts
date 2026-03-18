import { eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { donations, getCredentials } from "@/lib/server/schema";
import {
  applyLiveTrackedBalance,
  getDonorWeeklyUsageMap,
  type DonorWeeklyUsage,
} from "@/lib/server/claims/donor-usage";
import { getAdminConfig, type DonorSelectionPolicy } from "@/lib/server/config";
import { type WeekWindow } from "@/lib/server/timezone";
import { fetchLiveTrackedBalance } from "@/lib/server/get/tracked-balance";

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

  const candidatesWithUsage: RankedDonorCandidate[] = donorRows
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
    .filter((candidate) => candidate.usage.capRemainingThisWeek >= claimAmount);

  if (candidatesWithUsage.length === 0) {
    throw new Error("No eligible donors available under weekly cap limits.");
  }

  const withBalances = await Promise.all(
    candidatesWithUsage.map(async (candidate) => {
      try {
        const liveTrackedBalance = await fetchLiveTrackedBalance(candidate.donorUserId);
        return {
          ...candidate,
          liveTrackedBalance,
          usage: applyLiveTrackedBalance(candidate.usage, liveTrackedBalance),
        };
      } catch (error) {
        console.warn(`Failed to retrieve live balance for donor ${candidate.donorUserId}:`, error);
        return candidate;
      }
    })
  );

  let candidates = withBalances.filter(
    (candidate) => candidate.usage.remainingThisWeek >= claimAmount
  );

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
    const hasLiveBalance = candidates.some(
      (candidate) => typeof candidate.liveTrackedBalance === "number"
    );

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
