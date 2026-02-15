import { eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { adminConfig } from "@/lib/server/schema";

export type PoolCalculationMethod = "equal" | "proportional";
export type DonorSelectionPolicy =
  | "round_robin"
  | "weighted_round_robin"
  | "least_utilized"
  | "highest_balance";

export type AdminConfig = {
  defaultWeeklyAllowance: number;
  defaultClaimAmount: number;
  codeExpiryMinutes: number;
  poolCalculationMethod: PoolCalculationMethod;
  maxClaimsPerDay: number;
  minDonationAmount: number;
  maxDonationAmount: number;
  donorSelectionPolicy: DonorSelectionPolicy;
};

export const DEFAULT_ADMIN_CONFIG: AdminConfig = {
  defaultWeeklyAllowance: 50,
  defaultClaimAmount: 10,
  codeExpiryMinutes: 5,
  poolCalculationMethod: "equal",
  maxClaimsPerDay: 5,
  minDonationAmount: 10,
  maxDonationAmount: 500,
  donorSelectionPolicy: "least_utilized",
};

const ADMIN_CONFIG_ID = "global";

function normalizePoolCalculationMethod(value: unknown): PoolCalculationMethod {
  if (value === "equal" || value === "proportional") return value;
  throw new Error('poolCalculationMethod must be "equal" or "proportional"');
}

function normalizeDonorSelectionPolicy(value: unknown): DonorSelectionPolicy {
  if (
    value === "round_robin" ||
    value === "weighted_round_robin" ||
    value === "least_utilized" ||
    value === "highest_balance"
  ) {
    return value;
  }
  throw new Error(
    'donorSelectionPolicy must be one of "round_robin", "weighted_round_robin", "least_utilized", or "highest_balance"'
  );
}

function normalizeNonNegativeInteger(field: string, value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || Number.isNaN(numeric) || numeric < 0) {
    throw new Error(`Invalid value for ${field}`);
  }
  return Math.floor(numeric);
}

function rowToConfig(row: typeof adminConfig.$inferSelect): AdminConfig {
  return {
    defaultWeeklyAllowance: row.defaultWeeklyAllowance,
    defaultClaimAmount: row.defaultClaimAmount,
    codeExpiryMinutes: row.codeExpiryMinutes,
    poolCalculationMethod: normalizePoolCalculationMethod(row.poolCalculationMethod),
    maxClaimsPerDay: row.maxClaimsPerDay,
    minDonationAmount: row.minDonationAmount,
    maxDonationAmount: row.maxDonationAmount,
    donorSelectionPolicy: normalizeDonorSelectionPolicy(row.donorSelectionPolicy),
  };
}

async function ensureConfigRow() {
  await db
    .insert(adminConfig)
    .values({
      id: ADMIN_CONFIG_ID,
      ...DEFAULT_ADMIN_CONFIG,
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
}

export async function getAdminConfig(): Promise<{ config: AdminConfig; updatedAt: Date }> {
  await ensureConfigRow();

  const row = await db.query.adminConfig.findFirst({
    where: eq(adminConfig.id, ADMIN_CONFIG_ID),
  });

  if (!row) {
    throw new Error("Failed to load admin config");
  }

  return {
    config: rowToConfig(row),
    updatedAt: row.updatedAt,
  };
}

export async function updateAdminConfig(
  updates: Partial<AdminConfig>
): Promise<{ config: AdminConfig; updatedAt: Date }> {
  const current = await getAdminConfig();

  const merged: AdminConfig = {
    ...current.config,
  };

  if (updates.defaultWeeklyAllowance !== undefined) {
    merged.defaultWeeklyAllowance = normalizeNonNegativeInteger(
      "defaultWeeklyAllowance",
      updates.defaultWeeklyAllowance
    );
  }

  if (updates.defaultClaimAmount !== undefined) {
    merged.defaultClaimAmount = normalizeNonNegativeInteger(
      "defaultClaimAmount",
      updates.defaultClaimAmount
    );
  }

  if (updates.codeExpiryMinutes !== undefined) {
    merged.codeExpiryMinutes = normalizeNonNegativeInteger(
      "codeExpiryMinutes",
      updates.codeExpiryMinutes
    );
  }

  if (updates.maxClaimsPerDay !== undefined) {
    merged.maxClaimsPerDay = normalizeNonNegativeInteger(
      "maxClaimsPerDay",
      updates.maxClaimsPerDay
    );
  }

  if (updates.minDonationAmount !== undefined) {
    merged.minDonationAmount = normalizeNonNegativeInteger(
      "minDonationAmount",
      updates.minDonationAmount
    );
  }

  if (updates.maxDonationAmount !== undefined) {
    merged.maxDonationAmount = normalizeNonNegativeInteger(
      "maxDonationAmount",
      updates.maxDonationAmount
    );
  }

  if (updates.poolCalculationMethod !== undefined) {
    merged.poolCalculationMethod = normalizePoolCalculationMethod(
      updates.poolCalculationMethod
    );
  }

  if (updates.donorSelectionPolicy !== undefined) {
    merged.donorSelectionPolicy = normalizeDonorSelectionPolicy(
      updates.donorSelectionPolicy
    );
  }

  const [saved] = await db
    .insert(adminConfig)
    .values({
      id: ADMIN_CONFIG_ID,
      ...merged,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: adminConfig.id,
      set: {
        defaultWeeklyAllowance: merged.defaultWeeklyAllowance,
        defaultClaimAmount: merged.defaultClaimAmount,
        codeExpiryMinutes: merged.codeExpiryMinutes,
        poolCalculationMethod: merged.poolCalculationMethod,
        maxClaimsPerDay: merged.maxClaimsPerDay,
        minDonationAmount: merged.minDonationAmount,
        maxDonationAmount: merged.maxDonationAmount,
        donorSelectionPolicy: merged.donorSelectionPolicy,
        updatedAt: new Date(),
      },
    })
    .returning();

  return {
    config: rowToConfig(saved),
    updatedAt: saved.updatedAt,
  };
}
