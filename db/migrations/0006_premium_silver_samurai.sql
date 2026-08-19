CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_code_id" uuid NOT NULL,
	"donor_user_id" uuid NOT NULL,
	"kind" text DEFAULT 'donor_spend' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"title" text,
	"body" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"expo_ticket_ids" text,
	"last_error" text,
	"submitted_at" timestamp,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_claim_code_id_unique" UNIQUE("claim_code_id"),
	CONSTRAINT "notification_deliveries_kind_valid" CHECK ("notification_deliveries"."kind" = 'donor_spend'),
	CONSTRAINT "notification_deliveries_status_valid" CHECK ("notification_deliveries"."status" in ('pending', 'sending', 'submitted', 'sent', 'failed', 'skipped')),
	CONSTRAINT "notification_deliveries_attempts_nonnegative" CHECK ("notification_deliveries"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_tokens_platform_valid" CHECK ("push_tokens"."platform" in ('ios', 'android'))
);
--> statement-breakpoint
ALTER TABLE "admin_config" ADD COLUMN IF NOT EXISTS "donor_spend_notification_title" text DEFAULT 'Your SlugPoints helped someone' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_config" ADD COLUMN IF NOT EXISTS "donor_spend_notification_body" text DEFAULT 'Someone just spent {{amount}} of your donated SlugPoints. Thank you for sharing!' NOT NULL;--> statement-breakpoint
ALTER TABLE "donations" ADD COLUMN IF NOT EXISTS "notify_on_spend" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_claim_code_id_claim_codes_id_fk" FOREIGN KEY ("claim_code_id") REFERENCES "public"."claim_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_donor_user_id_users_id_fk" FOREIGN KEY ("donor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notification_deliveries_retry" ON "notification_deliveries" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_push_tokens_user_enabled" ON "push_tokens" USING btree ("user_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "claim_codes_active_requester_unique" ON "claim_codes" USING btree ("user_id") WHERE "claim_codes"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "claim_codes_active_donor_unique" ON "claim_codes" USING btree ("donor_user_id") WHERE "claim_codes"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "donations_user_id_unique" ON "donations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_allowances_user_weekly_pool_unique" ON "user_allowances" USING btree ("user_id","weekly_pool_id");--> statement-breakpoint
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_config_positive_values') THEN
    ALTER TABLE "admin_config" ADD CONSTRAINT "admin_config_positive_values" CHECK ("admin_config"."default_weekly_allowance" > 0 and "admin_config"."default_claim_amount" > 0 and "admin_config"."code_expiry_minutes" > 0 and "admin_config"."max_claims_per_day" > 0 and "admin_config"."min_donation_amount" > 0 and "admin_config"."max_donation_amount" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_config_donation_range_valid') THEN
    ALTER TABLE "admin_config" ADD CONSTRAINT "admin_config_donation_range_valid" CHECK ("admin_config"."min_donation_amount" <= "admin_config"."max_donation_amount");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_config_claim_within_allowance') THEN
    ALTER TABLE "admin_config" ADD CONSTRAINT "admin_config_claim_within_allowance" CHECK ("admin_config"."default_claim_amount" <= "admin_config"."default_weekly_allowance");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_config_pool_method_valid') THEN
    ALTER TABLE "admin_config" ADD CONSTRAINT "admin_config_pool_method_valid" CHECK ("admin_config"."pool_calculation_method" in ('equal', 'proportional'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_config_donor_policy_valid') THEN
    ALTER TABLE "admin_config" ADD CONSTRAINT "admin_config_donor_policy_valid" CHECK ("admin_config"."donor_selection_policy" in ('round_robin', 'weighted_round_robin', 'least_utilized', 'highest_balance'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claim_codes_amount_positive') THEN
    ALTER TABLE "claim_codes" ADD CONSTRAINT "claim_codes_amount_positive" CHECK ("claim_codes"."amount" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claim_codes_status_valid') THEN
    ALTER TABLE "claim_codes" ADD CONSTRAINT "claim_codes_status_valid" CHECK ("claim_codes"."status" in ('pending', 'active', 'redeemed', 'expired', 'cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claim_codes_expiry_valid') THEN
    ALTER TABLE "claim_codes" ADD CONSTRAINT "claim_codes_expiry_valid" CHECK ("claim_codes"."expires_at" > "claim_codes"."created_at");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'donations_amount_positive') THEN
    ALTER TABLE "donations" ADD CONSTRAINT "donations_amount_positive" CHECK ("donations"."amount" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'donations_status_valid') THEN
    ALTER TABLE "donations" ADD CONSTRAINT "donations_status_valid" CHECK ("donations"."status" in ('active', 'paused', 'cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'donations_date_window_valid') THEN
    ALTER TABLE "donations" ADD CONSTRAINT "donations_date_window_valid" CHECK ("donations"."end_date" is null or "donations"."end_date" >= "donations"."start_date");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'redemptions_amount_positive') THEN
    ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_amount_positive" CHECK ("redemptions"."amount" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_allowances_amounts_nonnegative') THEN
    ALTER TABLE "user_allowances" ADD CONSTRAINT "user_allowances_amounts_nonnegative" CHECK ("user_allowances"."weekly_limit" >= 0 and "user_allowances"."used_amount" >= 0 and "user_allowances"."remaining_amount" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_allowances_remaining_within_limit') THEN
    ALTER TABLE "user_allowances" ADD CONSTRAINT "user_allowances_remaining_within_limit" CHECK ("user_allowances"."remaining_amount" <= "user_allowances"."weekly_limit");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_pools_window_valid') THEN
    ALTER TABLE "weekly_pools" ADD CONSTRAINT "weekly_pools_window_valid" CHECK ("weekly_pools"."week_end" > "weekly_pools"."week_start");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_pools_amounts_nonnegative') THEN
    ALTER TABLE "weekly_pools" ADD CONSTRAINT "weekly_pools_amounts_nonnegative" CHECK ("weekly_pools"."total_amount" >= 0 and "weekly_pools"."allocated_amount" >= 0 and "weekly_pools"."remaining_amount" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_pools_balances_within_total') THEN
    ALTER TABLE "weekly_pools" ADD CONSTRAINT "weekly_pools_balances_within_total" CHECK ("weekly_pools"."allocated_amount" <= "weekly_pools"."total_amount" and "weekly_pools"."remaining_amount" <= "weekly_pools"."total_amount");
  END IF;
END
$migration$;
