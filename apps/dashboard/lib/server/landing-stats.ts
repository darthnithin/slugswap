import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { claimCodes, donations, users } from "@/lib/server/schema";
import { getActiveDonorRemainingTotal } from "@/lib/server/claims/donor-usage";

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

    const [pointsDistributedResult, availablePointsThisWeek, activeDonorsResult, totalUsersResult] =
      await Promise.all([
        db
          .select({ total: sql<number>`coalesce(sum(${claimCodes.amount}), 0)` })
          .from(claimCodes)
          .where(eq(claimCodes.status, "redeemed")),
        getActiveDonorRemainingTotal(now),
        db
          .select({ count: sql<number>`count(distinct ${donations.userId})` })
          .from(donations)
          .where(eq(donations.status, "active")),
        db
          .select({ count: sql<number>`coalesce(count(*), 0)` })
          .from(users),
      ]);

    return {
      pointsDistributed: toSafeNumber(pointsDistributedResult[0]?.total),
      availablePointsThisWeek: toSafeNumber(availablePointsThisWeek),
      activeDonors: toSafeNumber(activeDonorsResult[0]?.count),
      totalUsers: toSafeNumber(totalUsersResult[0]?.count),
    };
  } catch (error) {
    console.error("Failed to load landing stats:", error);
    throw error;
  }
}
