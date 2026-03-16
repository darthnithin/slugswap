import { and, eq, gte, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { claimCodes, donations, users, weeklyPools } from "@/lib/server/schema";

export type LandingStats = {
  pointsDistributed: number;
  availablePointsThisWeek: number;
  activeDonors: number;
  totalUsers: number;
};

function toSafeNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return 0;
  return Math.max(0, parsed);
}

export async function getLandingStats(): Promise<LandingStats> {
  try {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const [pointsDistributedResult, currentPoolResult, estimatedPoolResult, weeklyClaimSum, activeDonorsResult, totalUsersResult] =
      await Promise.all([
        db
          .select({ total: sql<number>`coalesce(sum(${claimCodes.amount}), 0)` })
          .from(claimCodes)
          .where(eq(claimCodes.status, "redeemed")),
        db
          .select({
            totalAmount: weeklyPools.totalAmount,
            allocatedAmount: weeklyPools.allocatedAmount,
            remainingAmount: weeklyPools.remainingAmount,
          })
          .from(weeklyPools)
          .where(and(lte(weeklyPools.weekStart, now), gte(weeklyPools.weekEnd, now)))
          .limit(1),
        db
          .select({ total: sql<number>`coalesce(sum(${donations.amount}), 0)` })
          .from(donations)
          .where(eq(donations.status, "active")),
        db
          .select({ total: sql<number>`coalesce(sum(${claimCodes.amount}), 0)` })
          .from(claimCodes)
          .where(
            and(
              gte(claimCodes.createdAt, weekStart),
              or(ne(claimCodes.status, "active"), gte(claimCodes.expiresAt, now))
            )
          ),
        db
          .select({ count: sql<number>`count(distinct ${donations.userId})` })
          .from(donations)
          .where(eq(donations.status, "active")),
        db
          .select({ count: sql<number>`coalesce(count(*), 0)` })
          .from(users),
      ]);

    const currentPool = currentPoolResult[0];
    const hasPoolData = currentPool && toSafeNumber(currentPool.totalAmount) > 0;
    const availablePointsThisWeek = hasPoolData
      ? toSafeNumber(currentPool.remainingAmount)
      : Math.max(0, toSafeNumber(estimatedPoolResult[0]?.total) - toSafeNumber(weeklyClaimSum[0]?.total));

    return {
      pointsDistributed: toSafeNumber(pointsDistributedResult[0]?.total),
      availablePointsThisWeek,
      activeDonors: toSafeNumber(activeDonorsResult[0]?.count),
      totalUsers: toSafeNumber(totalUsersResult[0]?.count),
    };
  } catch (error) {
    console.error("Failed to load landing stats:", error);
    throw error;
  }
}
