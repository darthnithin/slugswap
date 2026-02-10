import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql as sqlOp } from 'drizzle-orm';
import * as schema from '../../db/schema';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

// In-memory config store (in production, store in a DB table)
// Default values from RELEASE_1_STATUS.md
let poolConfig = {
  defaultWeeklyAllowance: 50,    // points per user per week
  defaultClaimAmount: 10,         // points per claim code
  codeExpiryMinutes: 5,           // how long before a code expires
  poolCalculationMethod: 'equal', // 'equal' | 'proportional'
  maxClaimsPerDay: 5,             // max codes a user can generate per day
  minDonationAmount: 10,          // minimum monthly donation
  maxDonationAmount: 500,         // maximum monthly donation
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({
      config: poolConfig,
      updatedAt: new Date().toISOString(),
    });
  }

  if (req.method === 'POST' || req.method === 'PATCH') {
    try {
      const updates = req.body;

      // Validate numeric fields
      const numericFields = [
        'defaultWeeklyAllowance',
        'defaultClaimAmount',
        'codeExpiryMinutes',
        'maxClaimsPerDay',
        'minDonationAmount',
        'maxDonationAmount',
      ] as const;

      for (const field of numericFields) {
        if (updates[field] !== undefined) {
          const val = Number(updates[field]);
          if (isNaN(val) || val < 0) {
            return res.status(400).json({ error: `Invalid value for ${field}` });
          }
          (poolConfig as any)[field] = val;
        }
      }

      if (updates.poolCalculationMethod) {
        if (!['equal', 'proportional'].includes(updates.poolCalculationMethod)) {
          return res.status(400).json({ error: 'poolCalculationMethod must be "equal" or "proportional"' });
        }
        poolConfig.poolCalculationMethod = updates.poolCalculationMethod;
      }

      return res.status(200).json({
        config: poolConfig,
        updatedAt: new Date().toISOString(),
        message: 'Configuration updated',
      });
    } catch (error) {
      console.error('Error updating config:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
