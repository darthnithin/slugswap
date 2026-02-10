import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, amount, userEmail } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ error: 'Missing userId or amount' });
    }

    const monthlyAmount = parseFloat(amount);
    if (isNaN(monthlyAmount) || monthlyAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Ensure the user exists in public.users before referencing it from donations.
    const existingUsers = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (existingUsers.length === 0) {
      if (!userEmail || typeof userEmail !== 'string') {
        return res.status(400).json({ error: 'Missing user email for first-time donor setup' });
      }

      await db
        .insert(schema.users)
        .values({
          id: userId,
          email: userEmail,
        })
        .onConflictDoNothing();
    }

    // Check if user already has an active donation
    const existingDonations = await db
      .select()
      .from(schema.donations)
      .where(eq(schema.donations.userId, userId))
      .limit(1);

    let donation;

    if (existingDonations.length > 0) {
      // Update existing donation
      const [updated] = await db
        .update(schema.donations)
        .set({
          amount: monthlyAmount.toString(),
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(schema.donations.id, existingDonations[0].id))
        .returning();

      donation = updated;
    } else {
      // Create new donation
      const [created] = await db
        .insert(schema.donations)
        .values({
          userId,
          amount: monthlyAmount.toString(),
          startDate: new Date(),
          status: 'active',
        })
        .returning();

      donation = created;
    }

    return res.status(200).json({
      success: true,
      donation,
    });
  } catch (error) {
    console.error('Error setting donation:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
