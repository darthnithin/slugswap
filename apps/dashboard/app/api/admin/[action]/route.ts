import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, lte, sql as sqlOp } from "drizzle-orm";
import { db } from "@/lib/server/db";
import * as schema from "@/lib/server/schema";
import {
  authenticateAdminBearerToken,
  clearAdminSessionCookie,
  getAdminIdentityFromRequest,
  isAdminRequestAuthenticated,
  withAdminSessionCookie,
} from "@/lib/server/admin-auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ action: string }> };

let poolConfig = {
  defaultWeeklyAllowance: 50,
  defaultClaimAmount: 10,
  codeExpiryMinutes: 5,
  poolCalculationMethod: "equal",
  maxClaimsPerDay: 5,
  minDonationAmount: 10,
  maxDonationAmount: 500,
};

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
      return NextResponse.json(
        {
          config: poolConfig,
          updatedAt: new Date().toISOString(),
        },
        { status: 200 }
      );
    }

    if (req.method === "POST" || req.method === "PATCH") {
      try {
        const updates = (await req.json()) as Record<string, unknown>;
        const numericFields = [
          "defaultWeeklyAllowance",
          "defaultClaimAmount",
          "codeExpiryMinutes",
          "maxClaimsPerDay",
          "minDonationAmount",
          "maxDonationAmount",
        ] as const;

        for (const field of numericFields) {
          if (updates[field] !== undefined) {
            const val = Number(updates[field]);
            if (Number.isNaN(val) || val < 0) {
              return NextResponse.json(
                { error: `Invalid value for ${field}` },
                { status: 400 }
              );
            }
            (poolConfig as any)[field] = val;
          }
        }

        if (updates.poolCalculationMethod) {
          if (!["equal", "proportional"].includes(String(updates.poolCalculationMethod))) {
            return NextResponse.json(
              { error: 'poolCalculationMethod must be "equal" or "proportional"' },
              { status: 400 }
            );
          }
          poolConfig.poolCalculationMethod = String(updates.poolCalculationMethod);
        }

        return NextResponse.json(
          {
            config: poolConfig,
            updatedAt: new Date().toISOString(),
            message: "Configuration updated",
          },
          { status: 200 }
        );
      } catch (error: any) {
        console.error("Error updating config:", error);
        return NextResponse.json(
          { error: error?.message || "Internal server error" },
          { status: 500 }
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
      const estimatedPoolQuery = await db
        .select({ total: sqlOp<string>`coalesce(sum(${schema.donations.amount}), '0')` })
        .from(schema.donations)
        .where(eq(schema.donations.status, "active"));
      const estimatedWeeklyTotal = parseFloat(estimatedPoolQuery[0]?.total || "0") / 4;

      const weeklyClaimSum = await db
        .select({ total: sqlOp<string>`coalesce(sum(${schema.claimCodes.amount}), '0')` })
        .from(schema.claimCodes)
        .where(gte(schema.claimCodes.createdAt, weekStart));
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
      const monthlyInflow = await db
        .select({ total: sqlOp<string>`coalesce(sum(${schema.donations.amount}), '0')` })
        .from(schema.donations)
        .where(eq(schema.donations.status, "active"));
      const avgDonation = await db
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

      const redeemedCount = claimsByStatus.redeemed?.count || 0;
      const redemptionRate =
        totalClaimsThisWeek > 0 ? Math.round((redeemedCount / totalClaimsThisWeek) * 100) : 0;

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
          .where(gte(schema.claimCodes.createdAt, weekStart));
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

      const poolHistory = await db
        .select()
        .from(schema.weeklyPools)
        .orderBy(desc(schema.weeklyPools.weekStart))
        .limit(8);
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
            monthlyInflow: parseFloat(monthlyInflow[0]?.total || "0"),
            avgMonthlyDonation: parseFloat(
              parseFloat(avgDonation[0]?.avg || "0").toFixed(2)
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
            name: d.userName || "Anonymous",
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

      // Get GET account balance
      const getCredential = await db.query.getCredentials.findFirst({
        where: eq(schema.getCredentials.userId, user.id),
      });

      let getBalance = null;
      if (getCredential) {
        try {
          // Call the internal GET accounts API
          const accountsResponse = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/get/accounts?userId=${user.id}`
          );
          if (accountsResponse.ok) {
            const data = (await accountsResponse.json()) as {
              accounts: Array<{ id: string; accountDisplayName: string; balance: number | null }>;
            };
            getBalance = data.accounts;
          }
        } catch (error) {
          console.warn("Failed to fetch GET balance:", error);
        }
      }

      // Get weekly allowance
      const { weekStart, weekEnd } = getWeekBounds();
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

      return NextResponse.json(
        {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
          },
          getBalance: getBalance,
          weeklyAllowance: allowanceInfo,
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
