import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { fetchLiveClaimCodeFromGet, resolveLinkedDonorUserId } from './_lib/get-claim-code';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, claimCodeId } = req.body as {
      userId?: string;
      claimCodeId?: string;
    };

    if (!userId || !claimCodeId) {
      return res.status(400).json({ error: 'Missing userId or claimCodeId' });
    }

    const claim = await db
      .select()
      .from(schema.claimCodes)
      .where(
        and(
          eq(schema.claimCodes.id, claimCodeId),
          eq(schema.claimCodes.userId, userId)
        )
      )
      .limit(1);

    if (claim.length === 0) {
      return res.status(404).json({ error: 'Claim code not found' });
    }

    const currentClaim = claim[0];
    if (currentClaim.status !== 'active') {
      return res.status(400).json({ error: 'Claim code is not active' });
    }
    if (currentClaim.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Claim code has expired' });
    }

    const donorUserId = await resolveLinkedDonorUserId(db);
    const { code, expiresAt } = await fetchLiveClaimCodeFromGet(donorUserId);
    await db
      .update(schema.claimCodes)
      .set({ expiresAt })
      .where(eq(schema.claimCodes.id, currentClaim.id));

    return res.status(200).json({
      success: true,
      claimCode: {
        id: currentClaim.id,
        code,
        amount: parseFloat(currentClaim.amount),
        expiresAt,
        status: currentClaim.status,
      },
    });
  } catch (error: any) {
    console.error('Error refreshing claim code:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
}
