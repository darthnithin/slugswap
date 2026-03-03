import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { claimCodes, donations } from "@/lib/server/schema";

export type LandingStats = {
  pointsDistributed: number;
  activeDonors: number;
  redemptionsCount: number;
};

function toSafeNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return 0;
  return Math.max(0, parsed);
}

export async function getLandingStats(): Promise<LandingStats> {
  try {
    const [pointsDistributedResult, activeDonorsResult, redemptionsCountResult] =
      await Promise.all([
      db
        .select({ total: sql<number>`coalesce(sum(${claimCodes.amount}), 0)` })
        .from(claimCodes)
        .where(eq(claimCodes.status, "redeemed")),
      db
        .select({ count: sql<number>`count(distinct ${donations.userId})` })
        .from(donations)
        .where(eq(donations.status, "active")),
      db
        .select({ count: sql<number>`coalesce(count(*), 0)` })
        .from(claimCodes)
        .where(eq(claimCodes.status, "redeemed")),
    ]);

    return {
      pointsDistributed: toSafeNumber(pointsDistributedResult[0]?.total),
      activeDonors: toSafeNumber(activeDonorsResult[0]?.count),
      redemptionsCount: toSafeNumber(redemptionsCountResult[0]?.count),
    };
  } catch (error) {
    console.error("Failed to load landing stats:", error);
    throw error;
  }
}
