import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { neon } from "@neondatabase/serverless";

const CONFIRMATION_TOKEN = "REPAIR_SLUGSWAP_DATABASE_2026_07";
const REPAIR_KEY = "2026-07-data-integrity-v1";

function hasConfirmation(): boolean {
  return (
    process.argv.includes("--apply") &&
    process.argv.includes(`--confirm=${CONFIRMATION_TOKEN}`)
  );
}

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

function toCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Repair returned an invalid aggregate.");
  return parsed;
}

async function main(): Promise<void> {
  if (!hasConfirmation()) {
    console.error("Database repair was not authorized; no connection was opened.");
    console.error(
      `To apply it intentionally, pass --apply --confirm=${CONFIRMATION_TOKEN}`
    );
    process.exitCode = 1;
    return;
  }

  const sql = neon(loadEnvironment());
  const queries = [
    sql`SET LOCAL lock_timeout = '5s'`,
    sql`SET LOCAL statement_timeout = '5min'`,
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`slugswap:${REPAIR_KEY}`}, 0))`,
    sql`
      LOCK TABLE
        public.admin_config,
        public.donations,
        public.redemptions,
        public.claim_codes,
        public.weekly_pools,
        public.user_allowances
      IN ACCESS EXCLUSIVE MODE
    `,
    sql`
      DO $repair_guard$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM redemptions
          GROUP BY claim_code_id
          HAVING count(*) > 1
            AND count(DISTINCT ROW(user_id, amount, get_tools_transaction_id)) > 1
        ) THEN
          RAISE EXCEPTION
            'Repair refused: duplicate redemptions disagree on requester, amount, or provider transaction.';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM redemptions redemption
          INNER JOIN claim_codes claim ON claim.id = redemption.claim_code_id
          WHERE redemption.user_id <> claim.user_id
        ) THEN
          RAISE EXCEPTION
            'Repair refused: a redemption requester does not match its claim requester.';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM donations
          GROUP BY user_id
          HAVING count(*) > 1
        ) THEN
          RAISE EXCEPTION
            'Repair refused: more than one donation row exists for a user.';
        END IF;

        IF EXISTS (
          SELECT 1
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
        ) THEN
          RAISE EXCEPTION
            'Repair refused: admin configuration violates required database invariants.';
        END IF;
      END
      $repair_guard$
    `,
    sql`CREATE SCHEMA IF NOT EXISTS slugswap_repair_backup`,
    sql`
      CREATE TABLE IF NOT EXISTS slugswap_repair_backup.manifest (
        repair_key text PRIMARY KEY,
        captured_at timestamptz NOT NULL DEFAULT now(),
        donation_rows bigint NOT NULL,
        redemption_rows bigint NOT NULL,
        claim_code_rows bigint NOT NULL,
        weekly_pool_rows bigint NOT NULL,
        allowance_rows bigint NOT NULL
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS slugswap_repair_backup.donations_20260713 (
        row_data jsonb NOT NULL
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS slugswap_repair_backup.redemptions_20260713 (
        row_data jsonb NOT NULL
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS slugswap_repair_backup.claim_codes_20260713 (
        row_data jsonb NOT NULL
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS slugswap_repair_backup.weekly_pools_20260713 (
        row_data jsonb NOT NULL
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS slugswap_repair_backup.user_allowances_20260713 (
        row_data jsonb NOT NULL
      )
    `,
    sql`
      INSERT INTO slugswap_repair_backup.manifest (
        repair_key,
        donation_rows,
        redemption_rows,
        claim_code_rows,
        weekly_pool_rows,
        allowance_rows
      )
      SELECT
        ${REPAIR_KEY},
        (SELECT count(*) FROM public.donations),
        (SELECT count(*) FROM public.redemptions),
        (SELECT count(*) FROM public.claim_codes),
        (SELECT count(*) FROM public.weekly_pools),
        (SELECT count(*) FROM public.user_allowances)
    `,
    sql`
      INSERT INTO slugswap_repair_backup.donations_20260713
      SELECT to_jsonb(source)
      FROM public.donations source
    `,
    sql`
      INSERT INTO slugswap_repair_backup.redemptions_20260713
      SELECT to_jsonb(source)
      FROM public.redemptions source
    `,
    sql`
      INSERT INTO slugswap_repair_backup.claim_codes_20260713
      SELECT to_jsonb(source)
      FROM public.claim_codes source
    `,
    sql`
      INSERT INTO slugswap_repair_backup.weekly_pools_20260713
      SELECT to_jsonb(source)
      FROM public.weekly_pools source
    `,
    sql`
      INSERT INTO slugswap_repair_backup.user_allowances_20260713
      SELECT to_jsonb(source)
      FROM public.user_allowances source
    `,
    sql`
      ALTER TABLE public.donations
      ADD COLUMN IF NOT EXISTS notify_on_spend boolean DEFAULT true
    `,
    sql`UPDATE public.donations SET notify_on_spend = true WHERE notify_on_spend IS NULL`,
    sql`ALTER TABLE public.donations ALTER COLUMN notify_on_spend SET DEFAULT true`,
    sql`ALTER TABLE public.donations ALTER COLUMN notify_on_spend SET NOT NULL`,
    sql`
      WITH ranked AS (
        SELECT
          id,
          row_number() OVER (
            PARTITION BY claim_code_id
            ORDER BY redeemed_at, id
          ) AS duplicate_rank
        FROM public.redemptions
      )
      DELETE FROM public.redemptions target
      USING ranked
      WHERE target.id = ranked.id
        AND ranked.duplicate_rank > 1
    `,
    sql`
      CREATE TEMP TABLE slugswap_pool_repair_map ON COMMIT DROP AS
      WITH normalized AS (
        SELECT
          id AS source_id,
          week_start,
          created_at,
          (
            date_trunc('week', week_start)
            AT TIME ZONE 'America/Los_Angeles'
          ) AT TIME ZONE 'UTC' AS canonical_start,
          (
            (date_trunc('week', week_start) + interval '7 days')
            AT TIME ZONE 'America/Los_Angeles'
          ) AT TIME ZONE 'UTC' AS canonical_end
        FROM public.weekly_pools
      )
      SELECT
        source_id,
        canonical_start,
        canonical_end,
        first_value(source_id) OVER (
          PARTITION BY canonical_start
          ORDER BY
            CASE WHEN week_start = canonical_start THEN 0 ELSE 1 END,
            created_at,
            source_id
        ) AS canonical_id
      FROM normalized
    `,
    sql`
      UPDATE public.claim_codes target
      SET weekly_pool_id = mapping.canonical_id
      FROM slugswap_pool_repair_map mapping
      WHERE target.weekly_pool_id = mapping.source_id
        AND mapping.source_id <> mapping.canonical_id
    `,
    sql`
      UPDATE public.user_allowances target
      SET weekly_pool_id = mapping.canonical_id
      FROM slugswap_pool_repair_map mapping
      WHERE target.weekly_pool_id = mapping.source_id
        AND mapping.source_id <> mapping.canonical_id
    `,
    sql`
      DELETE FROM public.weekly_pools target
      USING slugswap_pool_repair_map mapping
      WHERE target.id = mapping.source_id
        AND mapping.source_id <> mapping.canonical_id
    `,
    sql`
      UPDATE public.weekly_pools target
      SET
        week_start = mapping.canonical_start,
        week_end = mapping.canonical_end,
        updated_at = now()
      FROM (
        SELECT DISTINCT canonical_id, canonical_start, canonical_end
        FROM slugswap_pool_repair_map
      ) mapping
      WHERE target.id = mapping.canonical_id
        AND (
          target.week_start <> mapping.canonical_start
          OR target.week_end <> mapping.canonical_end
        )
    `,
    sql`
      CREATE TEMP TABLE slugswap_allowance_repair_map ON COMMIT DROP AS
      SELECT
        id AS source_id,
        first_value(id) OVER (
          PARTITION BY user_id, weekly_pool_id
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS canonical_id
      FROM public.user_allowances
    `,
    sql`
      DELETE FROM public.user_allowances target
      USING slugswap_allowance_repair_map mapping
      WHERE target.id = mapping.source_id
        AND mapping.source_id <> mapping.canonical_id
    `,
    sql`
      WITH redeemed_usage AS (
        SELECT
          claim.user_id,
          claim.weekly_pool_id,
          sum(redemption.amount)::numeric AS used_amount
        FROM public.redemptions redemption
        INNER JOIN public.claim_codes claim ON claim.id = redemption.claim_code_id
        GROUP BY claim.user_id, claim.weekly_pool_id
      ), recalculated AS (
        SELECT
          allowance.id,
          coalesce(usage.used_amount, 0)::numeric AS used_amount
        FROM public.user_allowances allowance
        LEFT JOIN redeemed_usage usage
          ON usage.user_id = allowance.user_id
          AND usage.weekly_pool_id = allowance.weekly_pool_id
      )
      UPDATE public.user_allowances target
      SET
        used_amount = recalculated.used_amount,
        remaining_amount = greatest(target.weekly_limit - recalculated.used_amount, 0),
        updated_at = now()
      FROM recalculated
      WHERE target.id = recalculated.id
        AND (
          target.used_amount <> recalculated.used_amount
          OR target.remaining_amount <> greatest(
            target.weekly_limit - recalculated.used_amount,
            0
          )
        )
    `,
    sql`
      UPDATE public.claim_codes
      SET status = 'expired'
      WHERE status = 'active'
        AND expires_at <= now()
    `,
    sql`
      WITH ranked AS (
        SELECT
          id,
          row_number() OVER (
            PARTITION BY user_id
            ORDER BY expires_at DESC, created_at DESC, id DESC
          ) AS active_rank
        FROM public.claim_codes
        WHERE status = 'active'
      )
      UPDATE public.claim_codes target
      SET status = 'expired'
      FROM ranked
      WHERE target.id = ranked.id
        AND ranked.active_rank > 1
    `,
    sql`
      WITH ranked AS (
        SELECT
          id,
          row_number() OVER (
            PARTITION BY donor_user_id
            ORDER BY expires_at DESC, created_at DESC, id DESC
          ) AS active_rank
        FROM public.claim_codes
        WHERE status = 'active'
          AND donor_user_id IS NOT NULL
      )
      UPDATE public.claim_codes target
      SET status = 'expired'
      FROM ranked
      WHERE target.id = ranked.id
        AND ranked.active_rank > 1
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS donations_user_id_unique
      ON public.donations USING btree (user_id)
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS user_allowances_user_weekly_pool_unique
      ON public.user_allowances USING btree (user_id, weekly_pool_id)
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS redemptions_claim_code_id_unique
      ON public.redemptions USING btree (claim_code_id)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_claim_codes_donor_redeemed
      ON public.claim_codes USING btree (donor_user_id, redeemed_at)
      WHERE status = 'redeemed'
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_claim_codes_donor_active_reservation
      ON public.claim_codes USING btree (donor_user_id, expires_at, created_at)
      WHERE status = 'active'
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS claim_codes_active_requester_unique
      ON public.claim_codes USING btree (user_id)
      WHERE status = 'active'
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS claim_codes_active_donor_unique
      ON public.claim_codes USING btree (donor_user_id)
      WHERE status = 'active'
    `,
    sql`
      CREATE TEMP TABLE slugswap_repair_verification ON COMMIT DROP AS
      WITH redeemed_usage AS (
        SELECT
          claim.user_id,
          claim.weekly_pool_id,
          coalesce(sum(redemption.amount), 0)::numeric AS used_amount
        FROM public.claim_codes claim
        INNER JOIN public.redemptions redemption ON redemption.claim_code_id = claim.id
        GROUP BY claim.user_id, claim.weekly_pool_id
      ), required_indexes (
        index_name,
        table_name,
        is_unique,
        columns,
        predicate_status
      ) AS (
        VALUES
          ('donations_user_id_unique', 'donations', true, ARRAY['user_id']::text[], NULL::text),
          ('user_allowances_user_weekly_pool_unique', 'user_allowances', true, ARRAY['user_id', 'weekly_pool_id']::text[], NULL::text),
          ('redemptions_claim_code_id_unique', 'redemptions', true, ARRAY['claim_code_id']::text[], NULL::text),
          ('idx_claim_codes_donor_redeemed', 'claim_codes', false, ARRAY['donor_user_id', 'redeemed_at']::text[], 'redeemed'),
          ('idx_claim_codes_donor_active_reservation', 'claim_codes', false, ARRAY['donor_user_id', 'expires_at', 'created_at']::text[], 'active'),
          ('claim_codes_active_requester_unique', 'claim_codes', true, ARRAY['user_id']::text[], 'active'),
          ('claim_codes_active_donor_unique', 'claim_codes', true, ARRAY['donor_user_id']::text[], 'active')
      ), actual_indexes AS (
        SELECT
          index_class.relname AS index_name,
          table_class.relname AS table_name,
          index_meta.indisunique AS is_unique,
          index_meta.indisvalid AS is_valid,
          index_meta.indisready AS is_ready,
          ARRAY(
            SELECT lower(replace(pg_get_indexdef(index_meta.indexrelid, position, true), '"', ''))
            FROM generate_series(1, index_meta.indnkeyatts) AS position
            ORDER BY position
          ) AS columns,
          regexp_replace(
            replace(
              replace(
                replace(
                  replace(
                    lower(coalesce(pg_get_expr(index_meta.indpred, index_meta.indrelid), '')),
                    '"',
                    ''
                  ),
                  '::text',
                  ''
                ),
                '(',
                ''
              ),
              ')',
              ''
            ),
            '[[:space:]]+',
            '',
            'g'
          ) AS normalized_predicate
        FROM pg_index index_meta
        INNER JOIN pg_class index_class ON index_class.oid = index_meta.indexrelid
        INNER JOIN pg_class table_class ON table_class.oid = index_meta.indrelid
        INNER JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
        WHERE table_namespace.nspname = 'public'
      ), index_drift AS (
        SELECT count(*)::int AS drift_count
        FROM required_indexes expected
        LEFT JOIN actual_indexes actual ON actual.index_name = expected.index_name
        WHERE actual.index_name IS NULL
           OR actual.table_name <> expected.table_name
           OR actual.is_unique <> expected.is_unique
           OR NOT actual.is_valid
           OR NOT actual.is_ready
           OR actual.columns <> expected.columns
           OR actual.normalized_predicate <>
              CASE
                WHEN expected.predicate_status IS NULL THEN ''
                ELSE 'status=''' || expected.predicate_status || ''''
              END
      )
      SELECT
        (
          SELECT count(*)::int
          FROM (
            SELECT claim_code_id
            FROM public.redemptions
            GROUP BY claim_code_id
            HAVING count(*) > 1
          ) groups
        ) AS duplicate_redemption_groups,
        (
          SELECT count(*)::int
          FROM (
            SELECT claim_code_id
            FROM public.redemptions
            GROUP BY claim_code_id
            HAVING count(*) > 1
              AND count(DISTINCT ROW(user_id, amount, get_tools_transaction_id)) > 1
          ) groups
        ) AS conflicting_redemption_groups,
        (
          SELECT count(*)::int
          FROM public.redemptions redemption
          INNER JOIN public.claim_codes claim ON claim.id = redemption.claim_code_id
          WHERE redemption.user_id <> claim.user_id
        ) AS redemption_requester_mismatches,
        (
          SELECT count(*)::int
          FROM (
            SELECT user_id, weekly_pool_id
            FROM public.user_allowances
            GROUP BY user_id, weekly_pool_id
            HAVING count(*) > 1
          ) groups
        ) AS duplicate_allowance_groups,
        (
          SELECT count(*)::int
          FROM (
            SELECT user_id
            FROM public.donations
            GROUP BY user_id
            HAVING count(*) > 1
          ) groups
        ) AS duplicate_donation_user_groups,
        (
          SELECT count(*)::int
          FROM public.weekly_pools a
          INNER JOIN public.weekly_pools b
            ON a.id < b.id
            AND a.week_start < b.week_end
            AND b.week_start < a.week_end
        ) AS overlapping_weekly_pool_pairs,
        (
          SELECT count(*)::int
          FROM public.weekly_pools
          WHERE week_end <= week_start
        ) AS invalid_weekly_pool_windows,
        (
          SELECT count(*)::int
          FROM public.claim_codes
          WHERE status = 'active' AND expires_at <= now()
        ) AS stale_active_claims,
        (
          SELECT count(*)::int
          FROM (
            SELECT user_id
            FROM public.claim_codes
            WHERE status = 'active'
            GROUP BY user_id
            HAVING count(*) > 1
          ) groups
        ) AS duplicate_active_requester_groups,
        (
          SELECT count(*)::int
          FROM (
            SELECT donor_user_id
            FROM public.claim_codes
            WHERE status = 'active' AND donor_user_id IS NOT NULL
            GROUP BY donor_user_id
            HAVING count(*) > 1
          ) groups
        ) AS duplicate_active_donor_groups,
        (
          SELECT count(*)::int
          FROM public.user_allowances allowance
          LEFT JOIN redeemed_usage usage
            ON usage.user_id = allowance.user_id
            AND usage.weekly_pool_id = allowance.weekly_pool_id
          WHERE allowance.used_amount <> coalesce(usage.used_amount, 0)
             OR allowance.remaining_amount <>
                greatest(allowance.weekly_limit - coalesce(usage.used_amount, 0), 0)
        ) AS allowance_balance_mismatches,
        (
          SELECT count(*)::int
          FROM public.donations
          WHERE amount <= 0
             OR status NOT IN ('active', 'paused', 'cancelled')
             OR (end_date IS NOT NULL AND end_date < start_date)
        ) AS invalid_donation_rows,
        (
          SELECT count(*)::int
          FROM public.weekly_pools
          WHERE total_amount < 0
             OR allocated_amount < 0
             OR remaining_amount < 0
             OR allocated_amount > total_amount
             OR remaining_amount > total_amount
        ) AS invalid_weekly_pool_rows,
        (
          SELECT count(*)::int
          FROM public.claim_codes
          WHERE amount <= 0
             OR status NOT IN ('pending', 'active', 'redeemed', 'expired', 'cancelled')
             OR expires_at <= created_at
        ) AS invalid_claim_code_rows,
        (
          SELECT count(*)::int
          FROM public.redemptions
          WHERE amount <= 0
        ) AS invalid_redemption_rows,
        (
          SELECT count(*)::int
          FROM public.user_allowances
          WHERE weekly_limit < 0
             OR used_amount < 0
             OR remaining_amount < 0
             OR remaining_amount > weekly_limit
        ) AS invalid_allowance_rows,
        (
          SELECT count(*)::int
          FROM public.admin_config
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
        )::int AS notify_on_spend_column_drift,
        (SELECT drift_count FROM index_drift) AS required_index_drift,
        (
          SELECT CASE WHEN EXISTS (
            SELECT 1
            FROM slugswap_repair_backup.manifest manifest
            WHERE manifest.repair_key = ${REPAIR_KEY}
              AND manifest.donation_rows = (
                SELECT count(*) FROM slugswap_repair_backup.donations_20260713
              )
              AND manifest.redemption_rows = (
                SELECT count(*) FROM slugswap_repair_backup.redemptions_20260713
              )
              AND manifest.claim_code_rows = (
                SELECT count(*) FROM slugswap_repair_backup.claim_codes_20260713
              )
              AND manifest.weekly_pool_rows = (
                SELECT count(*) FROM slugswap_repair_backup.weekly_pools_20260713
              )
              AND manifest.allowance_rows = (
                SELECT count(*) FROM slugswap_repair_backup.user_allowances_20260713
              )
          ) THEN 0 ELSE 1 END
        )::int AS backup_row_count_mismatches
    `,
    sql`
      DO $repair_verification$
      DECLARE
        issue_total bigint;
      BEGIN
        SELECT
          duplicate_redemption_groups
          + conflicting_redemption_groups
          + redemption_requester_mismatches
          + duplicate_allowance_groups
          + duplicate_donation_user_groups
          + overlapping_weekly_pool_pairs
          + invalid_weekly_pool_windows
          + stale_active_claims
          + duplicate_active_requester_groups
          + duplicate_active_donor_groups
          + allowance_balance_mismatches
          + invalid_donation_rows
          + invalid_weekly_pool_rows
          + invalid_claim_code_rows
          + invalid_redemption_rows
          + invalid_allowance_rows
          + invalid_admin_config_rows
          + notify_on_spend_column_drift
          + required_index_drift
          + backup_row_count_mismatches
        INTO issue_total
        FROM slugswap_repair_verification;

        IF coalesce(issue_total, 1) <> 0 THEN
          RAISE EXCEPTION
            'Repair verification failed; the transaction was rolled back. Run npm run db:audit for details.';
        END IF;
      END
      $repair_verification$
    `,
    sql`SELECT * FROM slugswap_repair_verification`,
  ];

  const results = await sql.transaction(queries);
  const summaryRows = results.at(-1) as unknown as Array<Record<string, unknown>>;
  const summary = summaryRows[0];
  if (!summary) throw new Error("Repair completed without a verification summary.");

  const verification = Object.fromEntries(
    Object.entries(summary).map(([name, value]) => [name, toCount(value)])
  );

  console.log(
    JSON.stringify(
      {
        repair: {
          verified: true,
          ...verification,
        },
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Database repair failed.";
  if (message.includes("manifest_pkey")) {
    console.error(
      `Repair refused: ${REPAIR_KEY} already has a completed backup manifest. Create a new reviewed repair instead of rerunning this one.`
    );
  } else {
    console.error(message);
  }
  process.exitCode = 1;
});
