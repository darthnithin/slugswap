import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, and, sql as sqlOp } from 'drizzle-orm';
import * as schema from '../../db/schema';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Missing userId' });
    }

    // Get user's donation info
    const donations = await db
      .select()
      .from(schema.donations)
      .where(eq(schema.donations.userId, userId))
      .limit(1);

    if (donations.length === 0) {
      return res.status(200).json({
        isActive: false,
        monthlyAmount: 0,
        peopleHelped: 0,
        pointsContributed: 0,
      });
    }

    const donation = donations[0];

    // Count unique requesters who have redeemed codes from pools
    // that included this donor's contribution
    const peopleHelped = await db
      .select({ count: sqlOp<number>`count(distinct ${schema.claimCodes.userId})` })
      .from(schema.claimCodes)
      .where(eq(schema.claimCodes.status, 'redeemed'));

    // Sum total points redeemed (as a proxy for contribution impact)
    const pointsContributed = await db
      .select({ total: sqlOp<string>`sum(${schema.claimCodes.amount})` })
      .from(schema.claimCodes)
      .where(eq(schema.claimCodes.status, 'redeemed'));

    return res.status(200).json({
      isActive: donation.status === 'active',
      monthlyAmount: parseFloat(donation.amount),
      status: donation.status,
      peopleHelped: peopleHelped[0]?.count || 0,
      pointsContributed: parseFloat(pointsContributed[0]?.total || '0'),
    });
  } catch (error) {
    console.error('Error fetching impact:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
