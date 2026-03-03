import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, lt, lte, ne, or, sql as sqlOp } from "drizzle-orm";
import { db } from "@/lib/server/db";
import * as schema from "@/lib/server/schema";
import {
  getAdminConfig,
  updateAdminConfig,
  type AdminConfig,
} from "@/lib/server/config";
import { getDonorWeeklyUsageMap } from "@/lib/server/claims/donor-usage";
import { getPacificWeekWindow } from "@/lib/server/timezone";
import { getActiveGetSession } from "@/lib/server/get/session";
import { retrieveAccounts } from "@/lib/server/get/tools";
import {
  authenticateAdminBearerToken,
  clearAdminSessionCookie,
  getAdminIdentityFromRequest,
  isAdminRequestAuthenticated,
  withAdminSessionCookie,
} from "@/lib/server/admin-auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ action: string }> };

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

function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function authMisconfiguredResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Admin auth is misconfigured";
  return NextResponse.json({ error: message }, { status: 500 });
}

function requireAdminAuth(req: NextRequest): NextResponse | null {
  try {
    if (!isAdminRequestAuthenticated(req)) {
      return unauthorizedResponse();
    }
    return null;
  } catch (error) {
    return authMisconfiguredResponse(error);
  }
}

function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token.trim() || null;
}

async function dispatch(req: NextRequest, ctx: Ctx) {
  const { action } = await ctx.params;

  if (action === "login") {
    if (req.method !== "POST") {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
      const token = extractBearerToken(req);
      if (!token) {
        return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
      }

      const result = await authenticateAdminBearerToken(token);
      if (result.status === "invalid_token") {
        return unauthorizedResponse();
      }
      if (result.status === "forbidden") {
        return NextResponse.json(
          { error: "Signed in account is not authorized for admin access" },
          { status: 403 }
        );
      }

      const response = NextResponse.json(
        { authenticated: true, email: result.identity.email },
        { status: 200 }
      );
      return withAdminSessionCookie(response, result.identity);
    } catch (error) {
      return authMisconfiguredResponse(error);
    }
  }

  if (action === "logout") {
    if (req.method !== "POST") {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }

    const response = NextResponse.json({ authenticated: false }, { status: 200 });
    return clearAdminSessionCookie(response);
  }

  if (action === "session") {
    if (req.method !== "GET") {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
      const identity = getAdminIdentityFromRequest(req);
      return NextResponse.json(
        { authenticated: !!identity, email: identity?.email ?? null },
        { status: 200 }
      );
    } catch (error) {
      return authMisconfiguredResponse(error);
    }
  }

  const authFailure = requireAdminAuth(req);
  if (authFailure) {
    return authFailure;
  }

  if (action === "config") {
    if (req.method === "GET") {
      const { config, updatedAt } = await getAdminConfig();
      return NextResponse.json(
        {
          config,
          updatedAt: updatedAt.toISOString(),
        },
        { status: 200 }
      );
    }

    if (req.method === "POST" || req.method === "PATCH") {
      try {
        const updates = (await req.json()) as Partial<AdminConfig>;
        const next = await updateAdminConfig(updates);

        return NextResponse.json(
          {
            config: next.config,
            updatedAt: next.updatedAt.toISOString(),
            message: "Configuration updated",
          },
          { status: 200 }
        );
      } catch (error: any) {
        console.error("Error updating config:", error);
        const message = error?.message || "Internal server error";
        const status =
          typeof message === "string" &&
          (message.startsWith("Invalid value") || message.includes("must be"))
            ? 400
            : 500;
        return NextResponse.json(
          { error: message },
          { status }
        );
      }
    }

    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (action === "users") {
    if (req.method !== "GET") {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }
    try {
      const url = new URL(req.url);
      const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
      const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);

      const [rows, countResult] = await Promise.all([
        db
          .select({
            id: schema.users.id,
            email: schema.users.email,
            name: schema.users.name,
            avatarUrl: schema.users.avatarUrl,
            createdAt: schema.users.createdAt,
            updatedAt: schema.users.updatedAt,
          })
          .from(schema.users)
          .orderBy(desc(schema.users.updatedAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: sqlOp<number>`count(*)` }).from(schema.users),
      ]);

      const total = Number(countResult[0]?.count ?? 0);
      return NextResponse.json(
        {
          users: rows.map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name ?? null,
            avatarUrl: u.avatarUrl ?? null,
            createdAt: u.createdAt.toISOString(),
            updatedAt: u.updatedAt.toISOString(),
          })),
          total,
          limit,
          offset,
        },
        { status: 200 }
      );
    } catch (error: unknown) {
      console.error("Error listing users:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Internal server error" },
        { status: 500 }
      );
    }
  }

  if (action === "stats") {
    if (req.method !== "GET") {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }
    try {
      const { weekStart, weekEnd } = getWeekBounds();
      const now = new Date();
      const [{ config }, ptWeekWindow] = await Promise.all([
        getAdminConfig(),
        getPacificWeekWindow(now),
      ]);
      const currentPool = await db
        .select()
        .from(schema.weeklyPools)
        .where(
          and(
            lte(schema.weeklyPools.weekStart, now),
            gte(schema.weeklyPools.weekEnd, now)
          )
        )
        .limit(1);

      const pool = currentPool[0] || null;
      const estimatedPoolQuery = await db
        .select({ total: sqlOp<string>`coalesce(sum(${schema.donations.amount}), '0')` })
        .from(schema.donations)
        .where(eq(schema.donations.status, "active"));
      const estimatedWeeklyTotal = parseFloat(estimatedPoolQuery[0]?.total || "0");

      const weeklyClaimSum = await db
        .select({ total: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')` })
        .from(schema.claimCodes)
        .where(
          and(
            gte(schema.claimCodes.createdAt, weekStart),
            or(ne(schema.claimCodes.status, "active"), gte(schema.claimCodes.expiresAt, now))
          )
        );
      const weeklyClaimedAmount = parseFloat(weeklyClaimSum[0]?.total || "0");

      const poolHasData = pool && parseFloat(pool.totalAmount) > 0;
      const poolTotal = poolHasData ? parseFloat(pool.totalAmount) : estimatedWeeklyTotal;
      const poolAllocated = poolHasData
        ? parseFloat(pool.allocatedAmount)
        : weeklyClaimedAmount;
      const poolRemaining = poolHasData
        ? parseFloat(pool.remainingAmount)
        : Math.max(0, poolTotal - poolAllocated);

      const poolHealth = {
        weekStart: pool ? pool.weekStart.toISOString() : weekStart.toISOString(),
        weekEnd: pool ? pool.weekEnd.toISOString() : weekEnd.toISOString(),
        totalAmount: poolTotal,
        allocatedAmount: poolAllocated,
        remainingAmount: poolRemaining,
        utilizationPct: poolTotal > 0 ? Math.round((poolAllocated / poolTotal) * 100) : 0,
        isEstimated: !poolHasData,
      };

      const activeDonors = await db
        .select({ count: sqlOp<number>`count(*)` })
        .from(schema.donations)
        .where(eq(schema.donations.status, "active"));
      const totalDonors = await db
        .select({ count: sqlOp<number>`count(*)` })
        .from(schema.donations);
      const pausedDonors = await db
        .select({ count: sqlOp<number>`count(*)` })
        .from(schema.donations)
        .where(eq(schema.donations.status, "paused"));
      const weeklyInflow = await db
        .select({ total: sqlOp<string>`coalesce(sum(${schema.donations.amount}), '0')` })
        .from(schema.donations)
        .where(eq(schema.donations.status, "active"));
      const avgWeeklyDonation = await db
        .select({ avg: sqlOp<string>`coalesce(avg(${schema.donations.amount}), '0')` })
        .from(schema.donations)
        .where(eq(schema.donations.status, "active"));

      const claimStats = await db
        .select({
          status: schema.claimCodes.status,
          count: sqlOp<number>`count(*)`,
          totalAmount: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')`,
        })
        .from(schema.claimCodes)
        .where(
          and(
            gte(schema.claimCodes.createdAt, weekStart),
            or(ne(schema.claimCodes.status, "active"), gte(schema.claimCodes.expiresAt, now))
          )
        )
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

      const redeemedCount = claimsByStatus.redeemed?.count || 0;
      const redemptionRate =
        totalClaimsThisWeek > 0 ? Math.round((redeemedCount / totalClaimsThisWeek) * 100) : 0;

      const allTimeClaims = await db
        .select({
          count: sqlOp<number>`count(*)`,
          totalAmount: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')`,
        })
        .from(schema.claimCodes)
        .where(or(ne(schema.claimCodes.status, "active"), gte(schema.claimCodes.expiresAt, now)));
      const allTimeRedeemed = await db
        .select({
          count: sqlOp<number>`count(*)`,
          totalAmount: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')`,
        })
        .from(schema.claimCodes)
        .where(eq(schema.claimCodes.status, "redeemed"));

      const totalUsers = await db
        .select({ count: sqlOp<number>`count(*)` })
        .from(schema.users);
      const uniqueRequesters = await db
        .select({ count: sqlOp<number>`count(distinct ${schema.claimCodes.userId})` })
        .from(schema.claimCodes);
      const uniqueDonors = await db
        .select({ count: sqlOp<number>`count(distinct ${schema.donations.userId})` })
        .from(schema.donations);

      let avgPointsPerRequester = 0;
      if (poolHasData) {
        const allowanceAvg = await db
          .select({ avg: sqlOp<string>`coalesce(avg(${schema.userAllowances.usedAmount}), '0')` })
          .from(schema.userAllowances)
          .where(eq(schema.userAllowances.weeklyPoolId, pool!.id));
        avgPointsPerRequester = parseFloat(allowanceAvg[0]?.avg || "0");
      } else {
        const weekClaimsByUser = await db
          .select({
            totalClaimed: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')`,
            uniqueUsers: sqlOp<number>`count(distinct ${schema.claimCodes.userId})`,
          })
          .from(schema.claimCodes)
          .where(
            and(
              gte(schema.claimCodes.createdAt, weekStart),
              or(ne(schema.claimCodes.status, "active"), gte(schema.claimCodes.expiresAt, now))
            )
          );
        const totalClaimed = parseFloat(weekClaimsByUser[0]?.totalClaimed || "0");
        const uniqueUsers = Number(weekClaimsByUser[0]?.uniqueUsers || 0);
        avgPointsPerRequester = uniqueUsers > 0 ? totalClaimed / uniqueUsers : 0;
      }

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

      const donorUsageInputs = topDonors.map((donor) => ({
        donorUserId: donor.userId,
        capAmount: parseFloat(donor.amount),
      }));
      const { usageMap } = await getDonorWeeklyUsageMap(
        donorUsageInputs,
        now,
        ptWeekWindow
      );

      const poolHistory = await db
        .select()
        .from(schema.weeklyPools)
        .orderBy(desc(schema.weeklyPools.weekStart))
        .limit(8);

      // Derive actual allocated amounts from redeemed claim codes per pool week
      const historicalClaimTotals = await db
        .select({
          weeklyPoolId: schema.claimCodes.weeklyPoolId,
          redeemedAmount: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')`,
        })
        .from(schema.claimCodes)
        .where(eq(schema.claimCodes.status, "redeemed"))
        .groupBy(schema.claimCodes.weeklyPoolId);
      const redeemedByPoolId = new Map(
        historicalClaimTotals.map((r) => [r.weeklyPoolId, parseFloat(r.redeemedAmount)])
      );

      const dailyWindowDays = 14;
      const dailyWindowStart = new Date(now);
      dailyWindowStart.setHours(0, 0, 0, 0);
      dailyWindowStart.setDate(dailyWindowStart.getDate() - (dailyWindowDays - 1));
      const dailyWindowEnd = new Date(now);
      dailyWindowEnd.setHours(0, 0, 0, 0);
      dailyWindowEnd.setDate(dailyWindowEnd.getDate() + 1);

      const dailyPools = await db
        .select({
          id: schema.weeklyPools.id,
          weekStart: schema.weeklyPools.weekStart,
          weekEnd: schema.weeklyPools.weekEnd,
          totalAmount: schema.weeklyPools.totalAmount,
        })
        .from(schema.weeklyPools)
        .where(
          and(
            lt(schema.weeklyPools.weekStart, dailyWindowEnd),
            gte(schema.weeklyPools.weekEnd, dailyWindowStart)
          )
        )
        .orderBy(schema.weeklyPools.weekStart);

      const earliestPoolStart = dailyPools.reduce(
        (min, poolRow) => (poolRow.weekStart < min ? poolRow.weekStart : min),
        dailyWindowStart
      );

      const dailyRedeemedClaims = await db
        .select({
          weeklyPoolId: schema.claimCodes.weeklyPoolId,
          redeemedAt: schema.claimCodes.redeemedAt,
          amount: schema.claimCodes.amount,
        })
        .from(schema.claimCodes)
        .where(
          and(
            eq(schema.claimCodes.status, "redeemed"),
            gte(schema.claimCodes.redeemedAt, earliestPoolStart),
            lt(schema.claimCodes.redeemedAt, dailyWindowEnd)
          )
        );

      const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: ptWeekWindow.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const dayLabelFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: ptWeekWindow.timezone,
        month: "short",
        day: "numeric",
      });
      const nowInPt = new Intl.DateTimeFormat("en-US", {
        timeZone: ptWeekWindow.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(now);
      const ptYear = Number(nowInPt.find((p) => p.type === "year")?.value ?? "0");
      const ptMonth = Number(nowInPt.find((p) => p.type === "month")?.value ?? "1");
      const ptDay = Number(nowInPt.find((p) => p.type === "day")?.value ?? "1");
      const ptTodayAnchor = new Date(Date.UTC(ptYear, ptMonth - 1, ptDay, 12, 0, 0, 0));
      const dailyBuckets = new Map<
        string,
        { dayStart: Date; dayLabel: string; redeemedAmount: number; poolRemainingAmount: number }
      >();

      for (let i = dailyWindowDays - 1; i >= 0; i--) {
        const day = new Date(ptTodayAnchor);
        day.setUTCDate(day.getUTCDate() - i);
        dailyBuckets.set(dayKeyFormatter.format(day), {
          dayStart: new Date(day),
          dayLabel: dayLabelFormatter.format(day),
          redeemedAmount: 0,
          poolRemainingAmount: 0,
        });
      }

      const redeemedByPoolAndDay = new Map<string, number>();
      for (const claim of dailyRedeemedClaims) {
        if (!claim.redeemedAt) continue;
        const dayKey = dayKeyFormatter.format(claim.redeemedAt);
        const poolDayKey = `${claim.weeklyPoolId}:${dayKey}`;
        const amount = parseFloat(claim.amount);
        redeemedByPoolAndDay.set(poolDayKey, (redeemedByPoolAndDay.get(poolDayKey) ?? 0) + amount);

        const key = dayKey;
        const bucket = dailyBuckets.get(key);
        if (!bucket) continue;
        bucket.redeemedAmount += amount;
      }

      const runningRedeemedByPool = new Map<string, number>();
      for (const [dayKey, bucket] of dailyBuckets.entries()) {
        const pool = dailyPools.find(
          (p) => p.weekStart <= bucket.dayStart && p.weekEnd > bucket.dayStart
        );
        if (!pool) {
          bucket.poolRemainingAmount = Math.max(0, estimatedWeeklyTotal - bucket.redeemedAmount);
          continue;
        }

        const redeemedTodayForPool = redeemedByPoolAndDay.get(`${pool.id}:${dayKey}`) ?? 0;
        const running = (runningRedeemedByPool.get(pool.id) ?? 0) + redeemedTodayForPool;
        runningRedeemedByPool.set(pool.id, running);

        const poolTotal = parseFloat(pool.totalAmount);
        bucket.poolRemainingAmount = Math.max(0, poolTotal - running);
      }

      const dailyHistory = Array.from(dailyBuckets.values()).map((bucket) => {
        return {
          dayStart: bucket.dayStart.toISOString(),
          dayLabel: bucket.dayLabel,
          redeemedAmount: bucket.redeemedAmount,
          remainingAmount: bucket.poolRemainingAmount,
        };
      });

      const linkedAccounts = await db
        .select({ count: sqlOp<number>`count(*)` })
        .from(schema.getCredentials);

      return NextResponse.json(
        {
          timestamp: new Date().toISOString(),
          pool: poolHealth,
          donors: {
            active: Number(activeDonors[0]?.count || 0),
            paused: Number(pausedDonors[0]?.count || 0),
            total: Number(totalDonors[0]?.count || 0),
            uniqueUsers: Number(uniqueDonors[0]?.count || 0),
            weeklyInflow: parseFloat(weeklyInflow[0]?.total || "0"),
            avgWeeklyDonation: parseFloat(
              parseFloat(avgWeeklyDonation[0]?.avg || "0").toFixed(2)
            ),
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
              totalAmount: parseFloat(allTimeClaims[0]?.totalAmount || "0"),
              redeemed: Number(allTimeRedeemed[0]?.count || 0),
              redeemedAmount: parseFloat(allTimeRedeemed[0]?.totalAmount || "0"),
            },
          },
          users: {
            total: Number(totalUsers[0]?.count || 0),
            uniqueRequesters: Number(uniqueRequesters[0]?.count || 0),
            uniqueDonors: Number(uniqueDonors[0]?.count || 0),
            linkedGetAccounts: Number(linkedAccounts[0]?.count || 0),
            avgPointsPerRequesterThisWeek: parseFloat(avgPointsPerRequester.toFixed(2)),
          },
          donorSelection: {
            policy: config.donorSelectionPolicy,
            timezone: ptWeekWindow.timezone,
            weekStart: ptWeekWindow.weekStart.toISOString(),
            weekEnd: ptWeekWindow.weekEnd.toISOString(),
          },
          recentClaims: recentClaims.map((c) => ({
            id: c.id,
            userId: c.userId,
            userName: c.userName || null,
            userEmail: c.userEmail || null,
            amount: parseFloat(c.amount),
            status: c.expiresAt < now && c.status === "active" ? "expired" : c.status,
            createdAt: c.createdAt.toISOString(),
            expiresAt: c.expiresAt.toISOString(),
          })),
          topDonors: topDonors.map((d) => {
            const fallbackCap = parseFloat(d.amount);
            const usage = usageMap.get(d.userId);
            return {
              userId: d.userId,
              name: d.userName || "Anonymous",
              email: d.userEmail,
              amount: parseFloat(d.amount),
              status: d.status,
              capAmount: usage?.capAmount ?? fallbackCap,
              redeemedThisWeek: usage?.redeemedThisWeek ?? 0,
              reservedThisWeek: usage?.reservedThisWeek ?? 0,
              remainingThisWeek: usage?.remainingThisWeek ?? fallbackCap,
              capReached: usage?.capReached ?? false,
              utilizationRatio: usage?.utilizationRatio ?? 0,
            };
          }),
          poolHistory: poolHistory.map((p) => {
            const computedAllocated = redeemedByPoolId.get(p.id) ?? 0;
            const recordedTotal = parseFloat(p.totalAmount);
            const weekTotal = Number.isFinite(recordedTotal) && recordedTotal > 0
              ? recordedTotal
              : estimatedWeeklyTotal;

            return {
              weekStart: p.weekStart.toISOString(),
              weekEnd: p.weekEnd.toISOString(),
              totalAmount: weekTotal,
              allocatedAmount: computedAllocated,
              remainingAmount: Math.max(0, weekTotal - computedAllocated),
            };
          }),
          dailyHistory,
        },
        { status: 200 }
      );
    } catch (error: any) {
      console.error("Error fetching admin stats:", error);
      return NextResponse.json(
        { error: error?.message || "Internal server error" },
        { status: 500 }
      );
    }
  }

  if (action === "user-balance") {
    if (req.method !== "GET") {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
      const url = new URL(req.url);
      const name = url.searchParams.get("name");
      const email = url.searchParams.get("email");
      const userId = url.searchParams.get("userId");

      if (!name && !email && !userId) {
        return NextResponse.json(
          { error: "Must provide name, email, or userId" },
          { status: 400 }
        );
      }

      // Find user by name, email, or userId
      let user;
      if (userId) {
        user = await db.query.users.findFirst({
          where: eq(schema.users.id, userId),
        });
      } else if (email) {
        user = await db.query.users.findFirst({
          where: eq(schema.users.email, email),
        });
      } else if (name) {
        // For name search, we need to use a raw query or filter manually
        const allUsers = await db
          .select()
          .from(schema.users)
          .where(sqlOp`LOWER(${schema.users.name}) LIKE LOWER(${`%${name}%`})`);
        user = allUsers[0];
      }

      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const now = new Date();
      const weekWindow = getPacificWeekWindow(now);

      // GET link + live balances
      const getCredential = await db.query.getCredentials.findFirst({
        where: eq(schema.getCredentials.userId, user.id),
      });

      let getBalance: Array<{ id: string; accountDisplayName: string; balance: number | null }> | null = null;
      let getAccountsError: string | null = null;
      if (getCredential) {
        try {
          const { sessionId } = await getActiveGetSession(user.id);
          getBalance = await retrieveAccounts(sessionId);
        } catch (error: any) {
          getAccountsError = error?.message || "Failed to fetch GET balances";
          console.warn("Failed to fetch GET balance:", error);
          getBalance = [];
        }
      }

      const trackedAccountNames = new Set(["flexi dollars", "banana bucks", "slug points"]);
      const trackedGetBalanceTotal = (getBalance ?? []).reduce((sum, account) => {
        if (!trackedAccountNames.has(account.accountDisplayName.trim().toLowerCase())) return sum;
        if (typeof account.balance !== "number" || Number.isNaN(account.balance)) return sum;
        return sum + account.balance;
      }, 0);

      // Weekly allowance
      const currentPool = await db
        .select()
        .from(schema.weeklyPools)
        .where(
          and(
            lte(schema.weeklyPools.weekStart, now),
            gte(schema.weeklyPools.weekEnd, now)
          )
        )
        .limit(1);

      let allowanceInfo = null;
      if (currentPool.length > 0) {
        const userAllowance = await db.query.userAllowances.findFirst({
          where: and(
            eq(schema.userAllowances.userId, user.id),
            eq(schema.userAllowances.weeklyPoolId, currentPool[0].id)
          ),
        });
        if (userAllowance) {
          allowanceInfo = {
            weeklyLimit: parseFloat(userAllowance.weeklyLimit),
            usedAmount: parseFloat(userAllowance.usedAmount),
            remainingAmount: parseFloat(userAllowance.remainingAmount),
          };
        }
      }

      // Requester usage
      const [
        requesterAllTimeClaims,
        requesterAllTimeRedeemed,
        requesterWeekClaims,
        requesterWeekRedeemed,
        requesterActiveClaims,
      ] = await Promise.all([
        db
          .select({
            count: sqlOp<number>`count(*)`,
            totalAmount: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')`,
          })
          .from(schema.claimCodes)
          .where(eq(schema.claimCodes.userId, user.id)),
        db
          .select({
            count: sqlOp<number>`count(*)`,
            totalAmount: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')`,
          })
          .from(schema.claimCodes)
          .where(
            and(
              eq(schema.claimCodes.userId, user.id),
              eq(schema.claimCodes.status, "redeemed")
            )
          ),
        db
          .select({
            count: sqlOp<number>`count(*)`,
            totalAmount: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')`,
          })
          .from(schema.claimCodes)
          .where(
            and(
              eq(schema.claimCodes.userId, user.id),
              gte(schema.claimCodes.createdAt, weekWindow.weekStart),
              lt(schema.claimCodes.createdAt, weekWindow.weekEnd)
            )
          ),
        db
          .select({
            count: sqlOp<number>`count(*)`,
            totalAmount: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')`,
          })
          .from(schema.claimCodes)
          .where(
            and(
              eq(schema.claimCodes.userId, user.id),
              eq(schema.claimCodes.status, "redeemed"),
              gte(schema.claimCodes.redeemedAt, weekWindow.weekStart),
              lt(schema.claimCodes.redeemedAt, weekWindow.weekEnd)
            )
          ),
        db
          .select({ count: sqlOp<number>`count(*)` })
          .from(schema.claimCodes)
          .where(
            and(
              eq(schema.claimCodes.userId, user.id),
              eq(schema.claimCodes.status, "active"),
              gte(schema.claimCodes.expiresAt, now)
            )
          ),
      ]);

      // Donor profile + donor usage
      const donation = await db.query.donations.findFirst({
        where: eq(schema.donations.userId, user.id),
      });

      let donorUsage: {
        status: string;
        weeklyAmount: number;
        redeemedThisWeek: number;
        reservedThisWeek: number;
        remainingThisWeek: number;
        allTimeRedeemedAmount: number;
        allTimeRedeemedCount: number;
      } | null = null;

      if (donation) {
        const weeklyAmount = parseFloat(donation.amount);
        const [
          donorRedeemedWeek,
          donorReservedWeek,
          donorAllTimeRedeemed,
        ] = await Promise.all([
          db
            .select({ total: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')` })
            .from(schema.claimCodes)
            .where(
              and(
                eq(schema.claimCodes.donorUserId, user.id),
                eq(schema.claimCodes.status, "redeemed"),
                gte(schema.claimCodes.redeemedAt, weekWindow.weekStart),
                lt(schema.claimCodes.redeemedAt, weekWindow.weekEnd)
              )
            ),
          db
            .select({ total: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')` })
            .from(schema.claimCodes)
            .where(
              and(
                eq(schema.claimCodes.donorUserId, user.id),
                eq(schema.claimCodes.status, "active"),
                gte(schema.claimCodes.createdAt, weekWindow.weekStart),
                lt(schema.claimCodes.createdAt, weekWindow.weekEnd),
                gte(schema.claimCodes.expiresAt, now)
              )
            ),
          db
            .select({
              totalAmount: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')`,
              count: sqlOp<number>`count(*)`,
            })
            .from(schema.claimCodes)
            .where(
              and(
                eq(schema.claimCodes.donorUserId, user.id),
                eq(schema.claimCodes.status, "redeemed")
              )
            ),
        ]);

        const redeemedThisWeek = parseFloat(donorRedeemedWeek[0]?.total || "0");
        const reservedThisWeek = parseFloat(donorReservedWeek[0]?.total || "0");
        donorUsage = {
          status: donation.status,
          weeklyAmount,
          redeemedThisWeek,
          reservedThisWeek,
          remainingThisWeek: weeklyAmount - (redeemedThisWeek + reservedThisWeek),
          allTimeRedeemedAmount: parseFloat(donorAllTimeRedeemed[0]?.totalAmount || "0"),
          allTimeRedeemedCount: Number(donorAllTimeRedeemed[0]?.count || 0),
        };
      }

      return NextResponse.json(
        {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
          },
          weekWindow: {
            timezone: weekWindow.timezone,
            weekStart: weekWindow.weekStart.toISOString(),
            weekEnd: weekWindow.weekEnd.toISOString(),
          },
          getLinkStatus: {
            linked: !!getCredential,
            linkedAt: getCredential?.linkedAt?.toISOString() ?? null,
            accountsFetchError: getAccountsError,
          },
          getBalance,
          trackedGetBalanceTotal,
          weeklyAllowance: allowanceInfo,
          requesterUsage: {
            allTimeClaimsCount: Number(requesterAllTimeClaims[0]?.count || 0),
            allTimeClaimsAmount: parseFloat(requesterAllTimeClaims[0]?.totalAmount || "0"),
            allTimeRedeemedCount: Number(requesterAllTimeRedeemed[0]?.count || 0),
            allTimeRedeemedAmount: parseFloat(requesterAllTimeRedeemed[0]?.totalAmount || "0"),
            thisWeekClaimsCount: Number(requesterWeekClaims[0]?.count || 0),
            thisWeekClaimsAmount: parseFloat(requesterWeekClaims[0]?.totalAmount || "0"),
            thisWeekRedeemedCount: Number(requesterWeekRedeemed[0]?.count || 0),
            thisWeekRedeemedAmount: parseFloat(requesterWeekRedeemed[0]?.totalAmount || "0"),
            activeClaimsCount: Number(requesterActiveClaims[0]?.count || 0),
          },
          donorUsage,
        },
        { status: 200 }
      );
    } catch (error: any) {
      console.error("Error fetching user balance:", error);
      return NextResponse.json(
        { error: error?.message || "Internal server error" },
        { status: 500 }
      );
    }
  }

  if (action === "update-allowance") {
    if (req.method !== "POST") {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
      const body = (await req.json()) as { userId: string; availablePoints: number };
      const { userId, availablePoints } = body;

      if (!userId || typeof availablePoints !== "number" || availablePoints < 0) {
        return NextResponse.json(
          { error: "Invalid userId or availablePoints" },
          { status: 400 }
        );
      }

      const { weekStart, weekEnd } = getWeekBounds();

      // Find current weekly pool
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

      if (!currentPool.length) {
        return NextResponse.json(
          { error: "No active weekly pool found" },
          { status: 404 }
        );
      }

      const poolId = currentPool[0].id;

      // Find existing allowance for this user and week
      const existingAllowances = await db
        .select()
        .from(schema.userAllowances)
        .where(
          and(
            eq(schema.userAllowances.userId, userId),
            eq(schema.userAllowances.weeklyPoolId, poolId)
          )
        )
        .limit(1);

      let result;
      if (existingAllowances.length > 0) {
        // Update existing allowance - set remaining amount directly
        const currentAllowance = existingAllowances[0];
        const currentUsed = parseFloat(currentAllowance.usedAmount);

        // Calculate new weekly limit based on available points + used amount
        const newWeeklyLimit = availablePoints + currentUsed;

        result = await db
          .update(schema.userAllowances)
          .set({
            weeklyLimit: newWeeklyLimit.toString(),
            remainingAmount: availablePoints.toString(),
            updatedAt: new Date(),
          })
          .where(eq(schema.userAllowances.id, currentAllowance.id))
          .returning();
      } else {
        // Create new allowance
        result = await db
          .insert(schema.userAllowances)
          .values({
            userId,
            weeklyPoolId: poolId,
            weeklyLimit: availablePoints.toString(),
            usedAmount: "0",
            remainingAmount: availablePoints.toString(),
          })
          .returning();
      }

      return NextResponse.json(
        {
          message: "Allowance updated successfully",
          allowance: {
            id: result[0].id,
            userId: result[0].userId,
            weeklyLimit: parseFloat(result[0].weeklyLimit),
            usedAmount: parseFloat(result[0].usedAmount),
            remainingAmount: parseFloat(result[0].remainingAmount),
          },
        },
        { status: 200 }
      );
    } catch (error: any) {
      console.error("Error updating allowance:", error);
      return NextResponse.json(
        { error: error?.message || "Internal server error" },
        { status: 500 }
      );
    }
  }

  if (!action) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return dispatch(req, ctx);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return dispatch(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return dispatch(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return dispatch(req, ctx);
}
