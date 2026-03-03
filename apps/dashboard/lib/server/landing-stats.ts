import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { claimCodes, donations } from "@/lib/server/schema";

export type LandingStats = {
  pointsDistributed: number;
  activeDonors: number;
  asOf: string;
};

const FALLBACK_STATS = {
  pointsDistributed: 497.79,
  activeDonors: 412,
} as const;

function toSafeNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return 0;
  return Math.max(0, parsed);
}

export async function getLandingStats(): Promise<LandingStats> {
  const asOf = new Date().toISOString();

  try {
    const [pointsDistributedResult, activeDonorsResult] = await Promise.all([
      db
        .select({ total: sql<number>`coalesce(sum(${claimCodes.amount}), 0)` })
        .from(claimCodes)
        .where(eq(claimCodes.status, "redeemed")),
      db
        .select({ count: sql<number>`count(distinct ${donations.userId})` })
        .from(donations)
        .where(eq(donations.status, "active")),
    ]);

    return {
      pointsDistributed: toSafeNumber(pointsDistributedResult[0]?.total),
      activeDonors: toSafeNumber(activeDonorsResult[0]?.count),
      asOf,
    };
  } catch (error) {
    console.error("Failed to load landing stats, using fallback values:", error);
    return {
      ...FALLBACK_STATS,
      asOf,
    };
  }
}
