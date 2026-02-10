import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, paused } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const newStatus = paused ? 'paused' : 'active';

    // Update donation status
    const [updated] = await db
      .update(schema.donations)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(schema.donations.userId, userId))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Donation not found' });
    }

    return res.status(200).json({
      success: true,
      status: updated.status,
    });
  } catch (error) {
    console.error('Error updating donation status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
