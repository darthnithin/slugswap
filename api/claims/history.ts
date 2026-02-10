import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, desc } from 'drizzle-orm';
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

    // Fetch user's claim codes, most recent first
    const claimCodes = await db
      .select()
      .from(schema.claimCodes)
      .where(eq(schema.claimCodes.userId, userId))
      .orderBy(desc(schema.claimCodes.createdAt))
      .limit(20);

    // Mark expired codes
    const now = new Date();
    const history = claimCodes.map((claim) => ({
      id: claim.id,
      code: claim.code,
      amount: parseFloat(claim.amount),
      status: claim.expiresAt < now && claim.status === 'active' ? 'expired' : claim.status,
      expiresAt: claim.expiresAt,
      redeemedAt: claim.redeemedAt,
      createdAt: claim.createdAt,
    }));

    return res.status(200).json({
      claims: history,
    });
  } catch (error) {
    console.error('Error fetching claim history:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
