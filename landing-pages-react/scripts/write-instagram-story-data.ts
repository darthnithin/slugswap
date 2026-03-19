import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, gte, lte, ne, or, sql } from "drizzle-orm";
import * as dbModuleImport from "../../db/index";
import * as schemaImport from "../../db/schema";

const dbModule = (dbModuleImport as { default?: { db: unknown }; db?: unknown }).default ?? dbModuleImport;
const schema = (schemaImport as { default?: Record<string, unknown> }).default ?? schemaImport;

const { db } = dbModule as { db: typeof dbModuleImport.db };
const { claimCodes, donations, getCredentials, users, weeklyPools } = schema as typeof schemaImport;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(
  SCRIPT_DIR,
  "../public/instagram-stories/end-of-quarter-mar-2026",
);
const OUTPUT_PATH = path.join(OUTPUT_DIR, "story-data.json");
const PACIFIC_TZ = "America/Los_Angeles";

function formatCompactNumber(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

async function main(): Promise<void> {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dayOfWeek);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const weekClaimsFilter = and(
    gte(claimCodes.createdAt, weekStart),
    or(ne(claimCodes.status, "active"), gte(claimCodes.expiresAt, now)),
  );
  const friday = new Date(now);
  friday.setDate(now.getDate() + ((5 - now.getDay() + 7) % 7));
  friday.setHours(0, 0, 0, 0);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [currentPoolResult, activeDonors, uniqueDonors, weeklyInflow, claimStats, allTimeClaims, allTimeRedeemed, totalUsers, linkedAccounts] =
    await Promise.all([
      db
        .select()
        .from(weeklyPools)
        .where(and(lte(weeklyPools.weekStart, now), gte(weeklyPools.weekEnd, now)))
        .limit(1),
      db
        .select({ count: sql`count(*)` })
        .from(donations)
        .where(eq(donations.status, "active")),
      db
        .select({ count: sql`count(distinct ${donations.userId})` })
        .from(donations),
      db
        .select({ total: sql`coalesce(sum(${donations.amount}), '0')` })
        .from(donations)
        .where(eq(donations.status, "active")),
      db
        .select({
          status: claimCodes.status,
          count: sql`count(*)`,
          totalAmount: sql`coalesce(sum(${claimCodes.amount}), '0')`,
        })
        .from(claimCodes)
        .where(weekClaimsFilter)
        .groupBy(claimCodes.status),
      db
        .select({
          count: sql`count(*)`,
          totalAmount: sql`coalesce(sum(${claimCodes.amount}), '0')`,
        })
        .from(claimCodes)
        .where(or(ne(claimCodes.status, "active"), gte(claimCodes.expiresAt, now))),
      db
        .select({
          count: sql`count(*)`,
          totalAmount: sql`coalesce(sum(${claimCodes.amount}), '0')`,
        })
        .from(claimCodes)
        .where(eq(claimCodes.status, "redeemed")),
      db.select({ count: sql`count(*)` }).from(users),
      db.select({ count: sql`count(*)` }).from(getCredentials),
    ]);

  const claimsByStatus = Object.fromEntries(
    claimStats.map((row) => [
      row.status,
      {
        count: Number(row.count),
        amount: Number(row.totalAmount),
      },
    ]),
  );
  const totalClaimsThisWeek = claimStats.reduce((sum, row) => sum + Number(row.count), 0);
  const totalAmountThisWeek = claimStats.reduce((sum, row) => sum + Number(row.totalAmount), 0);
  const redeemedClaimsThisWeek = claimsByStatus.redeemed?.count ?? 0;
  const redeemedAmountThisWeek = claimsByStatus.redeemed?.amount ?? 0;
  const redemptionRate =
    totalClaimsThisWeek > 0 ? Math.round((redeemedClaimsThisWeek / totalClaimsThisWeek) * 100) : 0;
  const pool = currentPoolResult[0] ?? null;
  const estimatedWeeklyTotal = Number(weeklyInflow[0]?.total ?? 0);
  const availablePointsThisWeek =
    pool && Number(pool.totalAmount) > 0
      ? Number(pool.remainingAmount)
      : Math.max(0, estimatedWeeklyTotal - totalAmountThisWeek);
  const daysLeftInQuarter = Math.max(
    0,
    Math.round((friday.getTime() - todayStart.getTime()) / 86400000),
  );

  const liveLabel = `LIVE DATA ${new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    month: "short",
    day: "numeric",
  })
    .format(now)
    .toUpperCase()}`;

  const data = {
    generatedAt: now.toISOString(),
    liveLabel,
    weekStart: currentPoolResult[0]?.weekStart?.toISOString() ?? weekStart.toISOString(),
    weekEnd: currentPoolResult[0]?.weekEnd?.toISOString() ?? weekEnd.toISOString(),
    stats: {
      activeDonors: Number(activeDonors[0]?.count ?? 0),
      uniqueDonors: Number(uniqueDonors[0]?.count ?? 0),
      claimsThisWeek: totalClaimsThisWeek,
      claimsThisWeekAmount: Number(totalAmountThisWeek.toFixed(2)),
      redeemedClaimsThisWeek,
      redeemedAmountThisWeek: Number(redeemedAmountThisWeek.toFixed(2)),
      redemptionRate: `${redemptionRate}%`,
      totalUsers: Number(totalUsers[0]?.count ?? 0),
      getAccountsLinked: Number(linkedAccounts[0]?.count ?? 0),
      allTimeClaims: Number(allTimeClaims[0]?.count ?? 0),
      pointsDistributed: Number(Number(allTimeRedeemed[0]?.totalAmount ?? 0).toFixed(2)),
      weeklyInflow: Number(Number(weeklyInflow[0]?.total ?? 0).toFixed(2)),
      availablePointsThisWeek: Number(availablePointsThisWeek.toFixed(2)),
      daysLeftInQuarter,
    },
    display: {
      pointsDistributed: formatCompactNumber(Number(allTimeRedeemed[0]?.totalAmount ?? 0)),
      weeklyInflow: formatCompactNumber(Number(weeklyInflow[0]?.total ?? 0)),
      claimsThisWeekAmount: formatCompactNumber(totalAmountThisWeek),
      redeemedAmountThisWeek: formatCompactNumber(redeemedAmountThisWeek),
      availablePointsThisWeek: formatCompactNumber(availablePointsThisWeek),
    },
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`Wrote story data to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
