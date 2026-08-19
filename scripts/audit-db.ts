import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { neon } from "@neondatabase/serverless";

type RequiredIndex = {
  columns: string[];
  predicateStatus?: "active" | "redeemed";
  table: string;
  unique: boolean;
};

type IndexRow = {
  columns: string[];
  index_name: string;
  is_ready: boolean;
  is_unique: boolean;
  is_valid: boolean;
  predicate: string;
  table_name: string;
};

type ConstraintRow = {
  constraint_name: string;
  definition: string;
  is_validated: boolean;
  table_name: string;
};

const REQUIRED_CHECK_CONSTRAINTS: Record<string, { definition: string; table: string }> = {
  donations_amount_positive: {
    definition: "CHECK (amount > 0::numeric)",
    table: "donations",
  },
  donations_status_valid: {
    definition:
      "CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'cancelled'::text]))",
    table: "donations",
  },
  donations_date_window_valid: {
    definition: "CHECK (end_date IS NULL OR end_date >= start_date)",
    table: "donations",
  },
  weekly_pools_window_valid: {
    definition: "CHECK (week_end > week_start)",
    table: "weekly_pools",
  },
  weekly_pools_amounts_nonnegative: {
    definition:
      "CHECK (total_amount >= 0::numeric AND allocated_amount >= 0::numeric AND remaining_amount >= 0::numeric)",
    table: "weekly_pools",
  },
  weekly_pools_balances_within_total: {
    definition:
      "CHECK (allocated_amount <= total_amount AND remaining_amount <= total_amount)",
    table: "weekly_pools",
  },
  claim_codes_amount_positive: {
    definition: "CHECK (amount > 0::numeric)",
    table: "claim_codes",
  },
  claim_codes_status_valid: {
    definition:
      "CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'redeemed'::text, 'expired'::text, 'cancelled'::text]))",
    table: "claim_codes",
  },
  claim_codes_expiry_valid: {
    definition: "CHECK (expires_at > created_at)",
    table: "claim_codes",
  },
  redemptions_amount_positive: {
    definition: "CHECK (amount > 0::numeric)",
    table: "redemptions",
  },
  user_allowances_amounts_nonnegative: {
    definition:
      "CHECK (weekly_limit >= 0::numeric AND used_amount >= 0::numeric AND remaining_amount >= 0::numeric)",
    table: "user_allowances",
  },
  user_allowances_remaining_within_limit: {
    definition: "CHECK (remaining_amount <= weekly_limit)",
    table: "user_allowances",
  },
  admin_config_positive_values: {
    definition:
      "CHECK (default_weekly_allowance > 0 AND default_claim_amount > 0 AND code_expiry_minutes > 0 AND max_claims_per_day > 0 AND min_donation_amount > 0 AND max_donation_amount > 0)",
    table: "admin_config",
  },
  admin_config_donation_range_valid: {
    definition: "CHECK (min_donation_amount <= max_donation_amount)",
    table: "admin_config",
  },
  admin_config_claim_within_allowance: {
    definition: "CHECK (default_claim_amount <= default_weekly_allowance)",
    table: "admin_config",
  },
  admin_config_pool_method_valid: {
    definition:
      "CHECK (pool_calculation_method = ANY (ARRAY['equal'::text, 'proportional'::text]))",
    table: "admin_config",
  },
  admin_config_donor_policy_valid: {
    definition:
      "CHECK (donor_selection_policy = ANY (ARRAY['round_robin'::text, 'weighted_round_robin'::text, 'least_utilized'::text, 'highest_balance'::text]))",
    table: "admin_config",
  },
};

const REQUIRED_INDEXES: Record<string, RequiredIndex> = {
  donations_user_id_unique: {
    columns: ["user_id"],
    table: "donations",
    unique: true,
  },
  user_allowances_user_weekly_pool_unique: {
    columns: ["user_id", "weekly_pool_id"],
    table: "user_allowances",
    unique: true,
  },
  redemptions_claim_code_id_unique: {
    columns: ["claim_code_id"],
    table: "redemptions",
    unique: true,
  },
  idx_claim_codes_donor_redeemed: {
    columns: ["donor_user_id", "redeemed_at"],
    predicateStatus: "redeemed",
    table: "claim_codes",
    unique: false,
  },
  idx_claim_codes_donor_active_reservation: {
    columns: ["donor_user_id", "expires_at", "created_at"],
    predicateStatus: "active",
    table: "claim_codes",
    unique: false,
  },
  claim_codes_active_requester_unique: {
    columns: ["user_id"],
    predicateStatus: "active",
    table: "claim_codes",
    unique: true,
  },
  claim_codes_active_donor_unique: {
    columns: ["donor_user_id"],
    predicateStatus: "active",
    table: "claim_codes",
    unique: true,
  },
};

function loadEnvironment(): string {
  if (existsSync(".env")) {
    loadEnvFile(".env");
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required (export it or add it to .env).");
  }
  return databaseUrl;
}

function count(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Database audit returned a non-numeric aggregate.");
  }
  return parsed;
}

function normalizeIdentifier(value: string): string {
  return value.replaceAll('"', "").trim().toLowerCase();
}

function predicateMatches(predicate: string, expectedStatus?: "active" | "redeemed"): boolean {
  const normalized = predicate.replaceAll('"', "").replace(/\s+/g, " ").toLowerCase();
  if (!expectedStatus) return normalized.trim() === "";
  return new RegExp(`status\\s*=\\s*'${expectedStatus}'(?:::text)?`).test(normalized);
}

function normalizeConstraintDefinition(value: string): string {
  return value
    .replaceAll('"', "")
    .toLowerCase()
    .replace(/::(?:text|numeric|integer|bigint|smallint|boolean)(?:\[\])?/g, "")
    .replace(/^check/, "")
    .replace(/[()\s]/g, "");
}

async function main(): Promise<void> {
  const sql = neon(loadEnvironment());

  const [aggregateRows, indexRows, constraintRows] = await Promise.all([
    sql`
      WITH redeemed_usage AS (
        SELECT
          c.user_id,
          c.weekly_pool_id,
          coalesce(sum(r.amount), 0)::numeric AS used_amount
        FROM claim_codes c
        INNER JOIN redemptions r ON r.claim_code_id = c.id
        GROUP BY c.user_id, c.weekly_pool_id
      )
      SELECT
        (
          SELECT count(*)::int
          FROM (
            SELECT claim_code_id
            FROM redemptions
            GROUP BY claim_code_id
            HAVING count(*) > 1
          ) duplicate_groups
        ) AS duplicate_redemption_groups,
        (
          SELECT count(*)::int
          FROM (
            SELECT claim_code_id
            FROM redemptions
            GROUP BY claim_code_id
            HAVING count(*) > 1
              AND count(DISTINCT ROW(user_id, amount, get_tools_transaction_id)) > 1
          ) conflicting_groups
        ) AS conflicting_redemption_groups,
        (
          SELECT count(*)::int
          FROM redemptions redemption
          INNER JOIN claim_codes claim ON claim.id = redemption.claim_code_id
          WHERE redemption.user_id <> claim.user_id
        ) AS redemption_requester_mismatches,
        (
          SELECT count(*)::int
          FROM (
            SELECT user_id, weekly_pool_id
            FROM user_allowances
            GROUP BY user_id, weekly_pool_id
            HAVING count(*) > 1
          ) duplicate_groups
        ) AS duplicate_allowance_groups,
        (
          SELECT count(*)::int
          FROM (
            SELECT user_id
            FROM donations
            GROUP BY user_id
            HAVING count(*) > 1
          ) duplicate_groups
        ) AS duplicate_donation_user_groups,
        (
          SELECT count(*)::int
          FROM weekly_pools a
          INNER JOIN weekly_pools b
            ON a.id < b.id
            AND a.week_start < b.week_end
            AND b.week_start < a.week_end
        ) AS overlapping_weekly_pool_pairs,
        (
          SELECT count(*)::int
          FROM weekly_pools
          WHERE week_end <= week_start
        ) AS invalid_weekly_pool_windows,
        (
          SELECT count(*)::int
          FROM claim_codes
          WHERE status = 'active' AND expires_at <= now()
        ) AS stale_active_claims,
        (
          SELECT count(*)::int
          FROM (
            SELECT user_id
            FROM claim_codes
            WHERE status = 'active'
            GROUP BY user_id
            HAVING count(*) > 1
          ) duplicate_active_requester_groups
        ) AS duplicate_active_requester_groups,
        (
          SELECT count(*)::int
          FROM (
            SELECT donor_user_id
            FROM claim_codes
            WHERE status = 'active' AND donor_user_id IS NOT NULL
            GROUP BY donor_user_id
            HAVING count(*) > 1
          ) duplicate_active_donor_groups
        ) AS duplicate_active_donor_groups,
        (
          SELECT count(*)::int
          FROM user_allowances ua
          LEFT JOIN redeemed_usage ru
            ON ru.user_id = ua.user_id
            AND ru.weekly_pool_id = ua.weekly_pool_id
          WHERE ua.used_amount <> coalesce(ru.used_amount, 0)
             OR ua.remaining_amount <> greatest(ua.weekly_limit - coalesce(ru.used_amount, 0), 0)
        ) AS allowance_balance_mismatches,
        (
          SELECT count(*)::int
          FROM donations
          WHERE amount <= 0
             OR status NOT IN ('active', 'paused', 'cancelled')
             OR (end_date IS NOT NULL AND end_date < start_date)
        ) AS invalid_donation_rows,
        (
          SELECT count(*)::int
          FROM weekly_pools
          WHERE total_amount < 0
             OR allocated_amount < 0
             OR remaining_amount < 0
             OR allocated_amount > total_amount
             OR remaining_amount > total_amount
        ) AS invalid_weekly_pool_rows,
        (
          SELECT count(*)::int
          FROM claim_codes
          WHERE amount <= 0
             OR status NOT IN ('pending', 'active', 'redeemed', 'expired', 'cancelled')
             OR expires_at <= created_at
        ) AS invalid_claim_code_rows,
        (
          SELECT count(*)::int
          FROM redemptions
          WHERE amount <= 0
        ) AS invalid_redemption_rows,
        (
          SELECT count(*)::int
          FROM user_allowances
          WHERE weekly_limit < 0
             OR used_amount < 0
             OR remaining_amount < 0
             OR remaining_amount > weekly_limit
        ) AS invalid_allowance_rows,
        (
          SELECT count(*)::int
          FROM admin_config
          WHERE default_weekly_allowance <= 0
             OR default_claim_amount <= 0
             OR code_expiry_minutes <= 0
             OR max_claims_per_day <= 0
             OR min_donation_amount <= 0
             OR max_donation_amount <= 0
             OR min_donation_amount > max_donation_amount
             OR default_claim_amount > default_weekly_allowance
             OR pool_calculation_method NOT IN ('equal', 'proportional')
             OR donor_selection_policy NOT IN (
               'round_robin',
               'weighted_round_robin',
               'least_utilized',
               'highest_balance'
             )
        ) AS invalid_admin_config_rows,
        (
          SELECT CASE WHEN EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'donations'
              AND column_name = 'notify_on_spend'
              AND data_type = 'boolean'
              AND is_nullable = 'NO'
              AND column_default ILIKE 'true%'
          ) THEN 0 ELSE 1 END
        )::int AS notify_on_spend_column_drift
    `,
    sql`
      SELECT
        index_class.relname AS index_name,
        table_class.relname AS table_name,
        index_meta.indisunique AS is_unique,
        index_meta.indisvalid AS is_valid,
        index_meta.indisready AS is_ready,
        ARRAY(
          SELECT pg_get_indexdef(index_meta.indexrelid, position, true)
          FROM generate_series(1, index_meta.indnkeyatts) AS position
          ORDER BY position
        ) AS columns,
        coalesce(pg_get_expr(index_meta.indpred, index_meta.indrelid), '') AS predicate
      FROM pg_index index_meta
      INNER JOIN pg_class index_class ON index_class.oid = index_meta.indexrelid
      INNER JOIN pg_class table_class ON table_class.oid = index_meta.indrelid
      INNER JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
      WHERE table_namespace.nspname = 'public'
        AND index_class.relname IN (
          'donations_user_id_unique',
          'user_allowances_user_weekly_pool_unique',
          'redemptions_claim_code_id_unique',
          'idx_claim_codes_donor_redeemed',
          'idx_claim_codes_donor_active_reservation',
          'claim_codes_active_requester_unique',
          'claim_codes_active_donor_unique'
        )
    `,
    sql`
      SELECT
        constraint_meta.conname AS constraint_name,
        table_class.relname AS table_name,
        constraint_meta.convalidated AS is_validated,
        pg_get_constraintdef(constraint_meta.oid, true) AS definition
      FROM pg_constraint constraint_meta
      INNER JOIN pg_class table_class ON table_class.oid = constraint_meta.conrelid
      INNER JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
      WHERE table_namespace.nspname = 'public'
        AND constraint_meta.contype = 'c'
        AND constraint_meta.conname IN (
          'donations_amount_positive',
          'donations_status_valid',
          'donations_date_window_valid',
          'weekly_pools_window_valid',
          'weekly_pools_amounts_nonnegative',
          'weekly_pools_balances_within_total',
          'claim_codes_amount_positive',
          'claim_codes_status_valid',
          'claim_codes_expiry_valid',
          'redemptions_amount_positive',
          'user_allowances_amounts_nonnegative',
          'user_allowances_remaining_within_limit',
          'admin_config_positive_values',
          'admin_config_donation_range_valid',
          'admin_config_claim_within_allowance',
          'admin_config_pool_method_valid',
          'admin_config_donor_policy_valid'
        )
    `,
  ]);

  const aggregate = aggregateRows[0] as Record<string, unknown> | undefined;
  if (!aggregate) throw new Error("Database audit returned no aggregate row.");

  const indexesByName = new Map(
    (indexRows as IndexRow[]).map((row) => [row.index_name, row] as const)
  );
  let missingRequiredIndexCount = 0;
  let mismatchedRequiredIndexCount = 0;

  for (const [name, expected] of Object.entries(REQUIRED_INDEXES)) {
    const actual = indexesByName.get(name);
    if (!actual) {
      missingRequiredIndexCount += 1;
      continue;
    }

    const actualColumns = actual.columns.map(normalizeIdentifier);
    const columnsMatch =
      actualColumns.length === expected.columns.length &&
      actualColumns.every((column, index) => column === expected.columns[index]);
    if (
      actual.table_name !== expected.table ||
      actual.is_unique !== expected.unique ||
      !actual.is_valid ||
      !actual.is_ready ||
      !columnsMatch ||
      !predicateMatches(actual.predicate, expected.predicateStatus)
    ) {
      mismatchedRequiredIndexCount += 1;
    }
  }

  const constraintsByName = new Map(
    (constraintRows as ConstraintRow[]).map((row) => [row.constraint_name, row] as const)
  );
  let missingRequiredConstraintCount = 0;
  let mismatchedRequiredConstraintCount = 0;
  for (const [name, expected] of Object.entries(REQUIRED_CHECK_CONSTRAINTS)) {
    const actual = constraintsByName.get(name);
    if (!actual) {
      missingRequiredConstraintCount += 1;
      continue;
    }
    if (
      actual.table_name !== expected.table ||
      !actual.is_validated ||
      normalizeConstraintDefinition(actual.definition) !==
        normalizeConstraintDefinition(expected.definition)
    ) {
      mismatchedRequiredConstraintCount += 1;
    }
  }

  const counts = {
    duplicateRedemptionGroups: count(aggregate.duplicate_redemption_groups),
    conflictingRedemptionGroups: count(aggregate.conflicting_redemption_groups),
    redemptionRequesterMismatches: count(aggregate.redemption_requester_mismatches),
    duplicateAllowanceGroups: count(aggregate.duplicate_allowance_groups),
    duplicateDonationUserGroups: count(aggregate.duplicate_donation_user_groups),
    overlappingWeeklyPoolPairs: count(aggregate.overlapping_weekly_pool_pairs),
    invalidWeeklyPoolWindows: count(aggregate.invalid_weekly_pool_windows),
    staleActiveClaims: count(aggregate.stale_active_claims),
    duplicateActiveRequesterGroups: count(aggregate.duplicate_active_requester_groups),
    duplicateActiveDonorGroups: count(aggregate.duplicate_active_donor_groups),
    allowanceBalanceMismatches: count(aggregate.allowance_balance_mismatches),
    invalidDonationRows: count(aggregate.invalid_donation_rows),
    invalidWeeklyPoolRows: count(aggregate.invalid_weekly_pool_rows),
    invalidClaimCodeRows: count(aggregate.invalid_claim_code_rows),
    invalidRedemptionRows: count(aggregate.invalid_redemption_rows),
    invalidAllowanceRows: count(aggregate.invalid_allowance_rows),
    invalidAdminConfigRows: count(aggregate.invalid_admin_config_rows),
    notifyOnSpendColumnDrift: count(aggregate.notify_on_spend_column_drift),
    requiredIndexCount: Object.keys(REQUIRED_INDEXES).length,
    missingRequiredIndexCount,
    mismatchedRequiredIndexCount,
    requiredConstraintCount: Object.keys(REQUIRED_CHECK_CONSTRAINTS).length,
    missingRequiredConstraintCount,
    mismatchedRequiredConstraintCount,
  };

  console.log(JSON.stringify({ databaseAudit: counts }, null, 2));

  const problemCount = Object.entries(counts).reduce((total, [key, value]) => {
    if (key === "requiredIndexCount" || key === "requiredConstraintCount") return total;
    return total + value;
  }, 0);
  if (problemCount > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Database audit failed.");
  process.exitCode = 1;
});
