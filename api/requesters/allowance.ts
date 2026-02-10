import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import * as schema from '../../db/schema';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

// Helper to get current week start/end
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const { weekStart, weekEnd } = getCurrentWeek();

    // Get or create current week's pool
    let weeklyPool = await db
      .select()
      .from(schema.weeklyPools)
      .where(eq(schema.weeklyPools.weekStart, weekStart))
      .limit(1);

    if (weeklyPool.length === 0) {
      // Create new weekly pool (in a real app, this would be done by a cron job)
      const [newPool] = await db
        .insert(schema.weeklyPools)
        .values({
          weekStart,
          weekEnd,
          totalAmount: '0', // Will be calculated from active donations
          allocatedAmount: '0',
          remainingAmount: '0',
        })
        .returning();

      weeklyPool = [newPool];
    }

    // Get user's allowance for this week
    let userAllowance = await db
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
      // Create default allowance (in real app, this would be calculated based on pool size)
      const DEFAULT_WEEKLY_LIMIT = 50; // Points per week

      const [newAllowance] = await db
        .insert(schema.userAllowances)
        .values({
          userId,
          weeklyPoolId: weeklyPool[0].id,
          weeklyLimit: DEFAULT_WEEKLY_LIMIT.toString(),
          usedAmount: '0',
          remainingAmount: DEFAULT_WEEKLY_LIMIT.toString(),
        })
        .returning();

      userAllowance = [newAllowance];
    }

    const allowance = userAllowance[0];

    // Calculate time until week resets
    const now = new Date();
    const timeUntilReset = weekEnd.getTime() - now.getTime();
    const daysUntilReset = Math.ceil(timeUntilReset / (1000 * 60 * 60 * 24));

    return res.status(200).json({
      weeklyLimit: parseFloat(allowance.weeklyLimit),
      usedAmount: parseFloat(allowance.usedAmount),
      remainingAmount: parseFloat(allowance.remainingAmount),
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      daysUntilReset,
    });
  } catch (error) {
    console.error('Error fetching allowance:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
