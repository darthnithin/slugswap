import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { claimCodes, donations, getCredentials } from "@/lib/server/schema";
import { getPacificWeekWindow, type WeekWindow } from "@/lib/server/timezone";

export type DonorCapInput = {
  donorUserId: string;
  capAmount: number;
};

export type DonorWeeklyUsage = {
  donorUserId: string;
  capAmount: number;
  redeemedThisWeek: number;
  reservedThisWeek: number;
  claimsSelectedThisWeek: number;
  committedThisWeek: number;
  capRemainingThisWeek: number;
  remainingThisWeek: number;
  capReached: boolean;
  lastSelectedAt: Date | null;
  utilizationRatio: number;
  liveTrackedBalance: number | null;
};

function toNumeric(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function computeUsageFromValues(input: {
  donorUserId: string;
  capAmount: number;
  redeemedThisWeek: number;
  reservedThisWeek: number;
  claimsSelectedThisWeek: number;
  lastSelectedAt: Date | null;
}): DonorWeeklyUsage {
  const capAmount = Math.max(0, input.capAmount);
  const committedThisWeek = input.redeemedThisWeek + input.reservedThisWeek;
  const capRemainingThisWeek = capAmount - committedThisWeek;
  return {
    donorUserId: input.donorUserId,
    capAmount,
    redeemedThisWeek: input.redeemedThisWeek,
    reservedThisWeek: input.reservedThisWeek,
    claimsSelectedThisWeek: input.claimsSelectedThisWeek,
    committedThisWeek,
    capRemainingThisWeek,
    remainingThisWeek: capRemainingThisWeek,
    capReached: capRemainingThisWeek <= 0,
    lastSelectedAt: input.lastSelectedAt,
    utilizationRatio: capAmount > 0 ? committedThisWeek / capAmount : Number.POSITIVE_INFINITY,
    liveTrackedBalance: null,
  };
}

export function applyLiveTrackedBalance(
  usage: DonorWeeklyUsage,
  liveTrackedBalance: number | null | undefined
): DonorWeeklyUsage {
  if (typeof liveTrackedBalance !== "number" || Number.isNaN(liveTrackedBalance)) {
    return usage;
  }

  const constrainedBalance = Math.max(0, liveTrackedBalance);
  const remainingThisWeek = Math.min(usage.capRemainingThisWeek, constrainedBalance);

  return {
    ...usage,
    liveTrackedBalance: constrainedBalance,
    remainingThisWeek,
    capReached: remainingThisWeek <= 0,
  };
}

export async function getDonorWeeklyUsageMap(
  donorCaps: DonorCapInput[],
  now = new Date(),
  weekWindow?: WeekWindow
): Promise<{ usageMap: Map<string, DonorWeeklyUsage>; weekWindow: WeekWindow }> {
  const window = weekWindow ?? getPacificWeekWindow(now);
  if (donorCaps.length === 0) {
    return { usageMap: new Map(), weekWindow: window };
  }
  const donorIds = new Set(donorCaps.map((d) => d.donorUserId));

  const [redeemedRows, reservedRows, claimCountRows, lastSelectedRows] = await Promise.all([
    db
      .select({
        donorUserId: claimCodes.donorUserId,
        total: sql<string>`coalesce(sum(${claimCodes.amount}), '0')`,
      })
      .from(claimCodes)
      .where(
        and(
          isNotNull(claimCodes.donorUserId),
          eq(claimCodes.status, "redeemed"),
          gte(claimCodes.redeemedAt, window.weekStart),
          lt(claimCodes.redeemedAt, window.weekEnd)
        )
      )
      .groupBy(claimCodes.donorUserId),
    db
      .select({
        donorUserId: claimCodes.donorUserId,
        total: sql<string>`coalesce(sum(${claimCodes.amount}), '0')`,
      })
      .from(claimCodes)
      .where(
        and(
          isNotNull(claimCodes.donorUserId),
          eq(claimCodes.status, "active"),
          gte(claimCodes.createdAt, window.weekStart),
          lt(claimCodes.createdAt, window.weekEnd),
          gte(claimCodes.expiresAt, now)
        )
      )
      .groupBy(claimCodes.donorUserId),
    db
      .select({
        donorUserId: claimCodes.donorUserId,
        count: sql<number>`count(*)`,
      })
      .from(claimCodes)
      .where(
        and(
          isNotNull(claimCodes.donorUserId),
          gte(claimCodes.createdAt, window.weekStart),
          lt(claimCodes.createdAt, window.weekEnd)
        )
      )
      .groupBy(claimCodes.donorUserId),
    db
      .select({
        donorUserId: claimCodes.donorUserId,
        lastSelectedAt: sql<Date | null>`max(${claimCodes.createdAt})`,
      })
      .from(claimCodes)
      .where(isNotNull(claimCodes.donorUserId))
      .groupBy(claimCodes.donorUserId),
  ]);

  const redeemedByDonor = new Map<string, number>();
  for (const row of redeemedRows) {
    if (!row.donorUserId || !donorIds.has(row.donorUserId)) continue;
    redeemedByDonor.set(row.donorUserId, toNumeric(row.total));
  }

  const reservedByDonor = new Map<string, number>();
  for (const row of reservedRows) {
    if (!row.donorUserId || !donorIds.has(row.donorUserId)) continue;
    reservedByDonor.set(row.donorUserId, toNumeric(row.total));
  }

  const claimCountByDonor = new Map<string, number>();
  for (const row of claimCountRows) {
    if (!row.donorUserId || !donorIds.has(row.donorUserId)) continue;
    claimCountByDonor.set(row.donorUserId, toNumeric(row.count));
  }

  const lastSelectedByDonor = new Map<string, Date | null>();
  for (const row of lastSelectedRows) {
    if (!row.donorUserId || !donorIds.has(row.donorUserId)) continue;
    lastSelectedByDonor.set(
      row.donorUserId,
      row.lastSelectedAt ? new Date(row.lastSelectedAt) : null
    );
  }

  const usageMap = new Map<string, DonorWeeklyUsage>();
  for (const donor of donorCaps) {
    usageMap.set(
      donor.donorUserId,
      computeUsageFromValues({
        donorUserId: donor.donorUserId,
        capAmount: donor.capAmount,
        redeemedThisWeek: redeemedByDonor.get(donor.donorUserId) ?? 0,
        reservedThisWeek: reservedByDonor.get(donor.donorUserId) ?? 0,
        claimsSelectedThisWeek: claimCountByDonor.get(donor.donorUserId) ?? 0,
        lastSelectedAt: lastSelectedByDonor.get(donor.donorUserId) ?? null,
      })
    );
  }

  return {
    usageMap,
    weekWindow: window,
  };
}

export async function getActiveDonorRemainingTotal(now = new Date()): Promise<number> {
  const donorRows = await db
    .select({
      donorUserId: donations.userId,
      capAmount: donations.amount,
    })
    .from(donations)
    .innerJoin(getCredentials, eq(getCredentials.userId, donations.userId))
    .where(eq(donations.status, "active"));

  if (donorRows.length === 0) {
    return 0;
  }

  const donorCaps = donorRows.map((row) => ({
    donorUserId: row.donorUserId,
    capAmount: toNumeric(row.capAmount),
  }));

  const { usageMap } = await getDonorWeeklyUsageMap(donorCaps, now);

  return donorCaps.reduce((sum, donor) => {
    const remaining = usageMap.get(donor.donorUserId)?.remainingThisWeek ?? 0;
    return sum + Math.max(0, remaining);
  }, 0);
}
