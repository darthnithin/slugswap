import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, and, gte, lte, sql as sqlOp, desc, count } from 'drizzle-orm';
import * as schema from '../../db/schema';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

function getWeekBounds() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dayOfWeek);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  return { weekStart, weekEnd };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { weekStart, weekEnd } = getWeekBounds();

    // --- Pool Health ---
    const currentPool = await db
      .select()
      .from(schema.weeklyPools)
      .where(
        and(
          lte(schema.weeklyPools.weekStart, new Date()),
          gte(schema.weeklyPools.weekEnd, new Date())
        )
      )
      .limit(1);

    const pool = currentPool[0] || null;

    // Estimate weekly pool from active donations when no pool row or pool has 0
    const estimatedPoolQuery = await db
      .select({ total: sqlOp<string>`coalesce(sum(${schema.donations.amount}), '0')` })
      .from(schema.donations)
      .where(eq(schema.donations.status, 'active'));
    const estimatedWeeklyTotal = parseFloat(estimatedPoolQuery[0]?.total || '0') / 4; // monthly / 4 weeks

    // Sum of claim amounts this week = "allocated" when pool row is empty
    const weeklyClaimSum = await db
      .select({ total: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')` })
      .from(schema.claimCodes)
      .where(gte(schema.claimCodes.createdAt, weekStart));
    const weeklyClaimedAmount = parseFloat(weeklyClaimSum[0]?.total || '0');

    const poolHasData = pool && parseFloat(pool.totalAmount) > 0;
    const poolTotal = poolHasData ? parseFloat(pool.totalAmount) : estimatedWeeklyTotal;
    const poolAllocated = poolHasData ? parseFloat(pool.allocatedAmount) : weeklyClaimedAmount;
    const poolRemaining = poolHasData ? parseFloat(pool.remainingAmount) : Math.max(0, poolTotal - poolAllocated);

    const poolHealth = {
      weekStart: pool ? pool.weekStart.toISOString() : weekStart.toISOString(),
      weekEnd: pool ? pool.weekEnd.toISOString() : weekEnd.toISOString(),
      totalAmount: poolTotal,
      allocatedAmount: poolAllocated,
      remainingAmount: poolRemaining,
      utilizationPct: poolTotal > 0 ? Math.round((poolAllocated / poolTotal) * 100) : 0,
      isEstimated: !poolHasData, // flag so UI can show "(estimated)" label
    };

    // --- Donor Stats ---
    const activeDonors = await db
      .select({ count: sqlOp<number>`count(*)` })
      .from(schema.donations)
      .where(eq(schema.donations.status, 'active'));

    const totalDonors = await db
      .select({ count: sqlOp<number>`count(*)` })
      .from(schema.donations);

    const pausedDonors = await db
      .select({ count: sqlOp<number>`count(*)` })
      .from(schema.donations)
      .where(eq(schema.donations.status, 'paused'));

    const monthlyInflow = await db
      .select({ total: sqlOp<string>`coalesce(sum(${schema.donations.amount}), '0')` })
      .from(schema.donations)
      .where(eq(schema.donations.status, 'active'));

    const avgDonation = await db
      .select({ avg: sqlOp<string>`coalesce(avg(${schema.donations.amount}), '0')` })
      .from(schema.donations)
      .where(eq(schema.donations.status, 'active'));

    // --- Claim Stats (current week) ---
    const claimStats = await db
      .select({
        status: schema.claimCodes.status,
        count: sqlOp<number>`count(*)`,
        totalAmount: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')`,
      })
      .from(schema.claimCodes)
      .where(gte(schema.claimCodes.createdAt, weekStart))
      .groupBy(schema.claimCodes.status);

    const claimsByStatus: Record<string, { count: number; amount: number }> = {};
    let totalClaimsThisWeek = 0;
    let totalClaimAmountThisWeek = 0;
    for (const row of claimStats) {
      claimsByStatus[row.status] = {
        count: Number(row.count),
        amount: parseFloat(row.totalAmount),
      };
      totalClaimsThisWeek += Number(row.count);
      totalClaimAmountThisWeek += parseFloat(row.totalAmount);
    }

    const redeemedCount = claimsByStatus['redeemed']?.count || 0;
    const redemptionRate =
      totalClaimsThisWeek > 0 ? Math.round((redeemedCount / totalClaimsThisWeek) * 100) : 0;

    // --- All-time Claim Stats ---
    const allTimeClaims = await db
      .select({
        count: sqlOp<number>`count(*)`,
        totalAmount: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')`,
      })
      .from(schema.claimCodes);

    const allTimeRedeemed = await db
      .select({
        count: sqlOp<number>`count(*)`,
        totalAmount: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')`,
      })
      .from(schema.claimCodes)
      .where(eq(schema.claimCodes.status, 'redeemed'));

    // --- User Stats ---
    const totalUsers = await db
      .select({ count: sqlOp<number>`count(*)` })
      .from(schema.users);

    const uniqueRequesters = await db
      .select({ count: sqlOp<number>`count(distinct ${schema.claimCodes.userId})` })
      .from(schema.claimCodes);

    const uniqueDonors = await db
      .select({ count: sqlOp<number>`count(distinct ${schema.donations.userId})` })
      .from(schema.donations);

    // --- Average points per requester (this week) ---
    // Try user_allowances first, fall back to avg claim amount per unique requester this week
    let avgPointsPerRequester = 0;
    if (poolHasData) {
      const allowanceAvg = await db
        .select({ avg: sqlOp<string>`coalesce(avg(${schema.userAllowances.usedAmount}), '0')` })
        .from(schema.userAllowances)
        .where(eq(schema.userAllowances.weeklyPoolId, pool!.id));
      avgPointsPerRequester = parseFloat(allowanceAvg[0]?.avg || '0');
    } else {
      // Calculate from actual claims this week: total claimed / unique requesters
      const weekClaimsByUser = await db
        .select({
          totalClaimed: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')`,
          uniqueUsers: sqlOp<number>`count(distinct ${schema.claimCodes.userId})`,
        })
        .from(schema.claimCodes)
        .where(gte(schema.claimCodes.createdAt, weekStart));
      const totalClaimed = parseFloat(weekClaimsByUser[0]?.totalClaimed || '0');
      const uniqueUsers = Number(weekClaimsByUser[0]?.uniqueUsers || 0);
      avgPointsPerRequester = uniqueUsers > 0 ? totalClaimed / uniqueUsers : 0;
    }

    // --- Recent claim codes (last 20) with user names ---
    const recentClaims = await db
      .select({
        id: schema.claimCodes.id,
        userId: schema.claimCodes.userId,
        userName: schema.users.name,
        userEmail: schema.users.email,
        amount: schema.claimCodes.amount,
        status: schema.claimCodes.status,
        createdAt: schema.claimCodes.createdAt,
        expiresAt: schema.claimCodes.expiresAt,
      })
      .from(schema.claimCodes)
      .leftJoin(schema.users, eq(schema.claimCodes.userId, schema.users.id))
      .orderBy(desc(schema.claimCodes.createdAt))
      .limit(20);

    // --- Top donors ---
    const topDonors = await db
      .select({
        userId: schema.donations.userId,
        amount: schema.donations.amount,
        status: schema.donations.status,
        userName: schema.users.name,
        userEmail: schema.users.email,
      })
      .from(schema.donations)
      .leftJoin(schema.users, eq(schema.donations.userId, schema.users.id))
      .orderBy(desc(schema.donations.amount))
      .limit(10);

    // --- Weekly pool history (last 8 weeks) ---
    const poolHistory = await db
      .select()
      .from(schema.weeklyPools)
      .orderBy(desc(schema.weeklyPools.weekStart))
      .limit(8);

    // --- GET credentials linked ---
    const linkedAccounts = await db
      .select({ count: sqlOp<number>`count(*)` })
      .from(schema.getCredentials);

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      pool: poolHealth,
      donors: {
        active: Number(activeDonors[0]?.count || 0),
        paused: Number(pausedDonors[0]?.count || 0),
        total: Number(totalDonors[0]?.count || 0),
        uniqueUsers: Number(uniqueDonors[0]?.count || 0),
        monthlyInflow: parseFloat(monthlyInflow[0]?.total || '0'),
        avgMonthlyDonation: parseFloat(parseFloat(avgDonation[0]?.avg || '0').toFixed(2)),
      },
      claims: {
        thisWeek: {
          total: totalClaimsThisWeek,
          totalAmount: totalClaimAmountThisWeek,
          byStatus: claimsByStatus,
          redemptionRate,
        },
        allTime: {
          total: Number(allTimeClaims[0]?.count || 0),
          totalAmount: parseFloat(allTimeClaims[0]?.totalAmount || '0'),
          redeemed: Number(allTimeRedeemed[0]?.count || 0),
          redeemedAmount: parseFloat(allTimeRedeemed[0]?.totalAmount || '0'),
        },
      },
      users: {
        total: Number(totalUsers[0]?.count || 0),
        uniqueRequesters: Number(uniqueRequesters[0]?.count || 0),
        uniqueDonors: Number(uniqueDonors[0]?.count || 0),
        linkedGetAccounts: Number(linkedAccounts[0]?.count || 0),
        avgPointsPerRequesterThisWeek: parseFloat(avgPointsPerRequester.toFixed(2)),
      },
      recentClaims: recentClaims.map((c) => ({
        id: c.id,
        userId: c.userId,
        userName: c.userName || null,
        userEmail: c.userEmail || null,
        amount: parseFloat(c.amount),
        status: c.status,
        createdAt: c.createdAt.toISOString(),
        expiresAt: c.expiresAt.toISOString(),
      })),
      topDonors: topDonors.map((d) => ({
        userId: d.userId,
        name: d.userName || 'Anonymous',
        email: d.userEmail,
        amount: parseFloat(d.amount),
        status: d.status,
      })),
      poolHistory: poolHistory.map((p) => ({
        weekStart: p.weekStart.toISOString(),
        weekEnd: p.weekEnd.toISOString(),
        totalAmount: parseFloat(p.totalAmount),
        allocatedAmount: parseFloat(p.allocatedAmount),
        remainingAmount: parseFloat(p.remainingAmount),
      })),
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
