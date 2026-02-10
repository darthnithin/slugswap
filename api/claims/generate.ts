import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, and, gte } from 'drizzle-orm';
import * as schema from '../../db/schema';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

// Helper to get current week
function getCurrentWeek() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diffToMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  return { weekStart, weekEnd };
}

// Generate random claim code (mock - would call GET Tools API in production)
function generateCode(): string {
  return `SLUG${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

// Mock GET Tools API call (replace with real integration)
async function callGetToolsAPI(amount: number): Promise<{ code: string; expiresAt: Date }> {
  // TODO: Replace with real GET Tools API integration
  // const response = await fetch(process.env.GET_TOOLS_API_URL, {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${process.env.GET_TOOLS_API_KEY}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({ amount }),
  // });

  // For now, generate mock code that expires in 5 minutes
  const code = generateCode();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 5);

  return { code, expiresAt };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, amount } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ error: 'Missing userId or amount' });
    }

    const claimAmount = parseFloat(amount);
    if (isNaN(claimAmount) || claimAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const { weekStart } = getCurrentWeek();

    // Get current week's pool
    const weeklyPool = await db
      .select()
      .from(schema.weeklyPools)
      .where(eq(schema.weeklyPools.weekStart, weekStart))
      .limit(1);

    if (weeklyPool.length === 0) {
      return res.status(400).json({ error: 'No active weekly pool' });
    }

    // Get user's allowance
    const userAllowance = await db
      .select()
      .from(schema.userAllowances)
      .where(
        and(
          eq(schema.userAllowances.userId, userId),
          eq(schema.userAllowances.weeklyPoolId, weeklyPool[0].id)
        )
      )
      .limit(1);

    if (userAllowance.length === 0) {
      return res.status(400).json({ error: 'No allowance found for this week' });
    }

    const allowance = userAllowance[0];
    const remaining = parseFloat(allowance.remainingAmount);

    // Check if user has enough allowance
    if (claimAmount > remaining) {
      return res.status(400).json({
        error: 'Insufficient allowance',
        remaining,
      });
    }

    // Generate code via GET Tools API (currently mocked)
    const { code, expiresAt } = await callGetToolsAPI(claimAmount);

    // Create claim code record
    const [claimCode] = await db
      .insert(schema.claimCodes)
      .values({
        userId,
        weeklyPoolId: weeklyPool[0].id,
        code,
        amount: claimAmount.toString(),
        status: 'active',
        expiresAt,
      })
      .returning();

    // Update user's allowance
    await db
      .update(schema.userAllowances)
      .set({
        usedAmount: (parseFloat(allowance.usedAmount) + claimAmount).toString(),
        remainingAmount: (remaining - claimAmount).toString(),
        updatedAt: new Date(),
      })
      .where(eq(schema.userAllowances.id, allowance.id));

    return res.status(200).json({
      success: true,
      claimCode: {
        id: claimCode.id,
        code: claimCode.code,
        amount: parseFloat(claimCode.amount),
        expiresAt: claimCode.expiresAt,
        status: claimCode.status,
      },
    });
  } catch (error) {
    console.error('Error generating claim code:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
