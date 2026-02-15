CREATE TABLE "admin_config" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"default_weekly_allowance" integer DEFAULT 50 NOT NULL,
	"default_claim_amount" integer DEFAULT 10 NOT NULL,
	"code_expiry_minutes" integer DEFAULT 5 NOT NULL,
	"pool_calculation_method" text DEFAULT 'equal' NOT NULL,
	"max_claims_per_day" integer DEFAULT 5 NOT NULL,
	"min_donation_amount" integer DEFAULT 10 NOT NULL,
	"max_donation_amount" integer DEFAULT 500 NOT NULL,
	"donor_selection_policy" text DEFAULT 'least_utilized' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "admin_config" (
	"id",
	"default_weekly_allowance",
	"default_claim_amount",
	"code_expiry_minutes",
	"pool_calculation_method",
	"max_claims_per_day",
	"min_donation_amount",
	"max_donation_amount",
	"donor_selection_policy"
) VALUES (
	'global',
	50,
	10,
	5,
	'equal',
	5,
	10,
	500,
	'least_utilized'
)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
CREATE INDEX "idx_claim_codes_donor_redeemed" ON "claim_codes" USING btree ("donor_user_id","redeemed_at") WHERE "status" = 'redeemed';
--> statement-breakpoint
CREATE INDEX "idx_claim_codes_donor_active_reservation" ON "claim_codes" USING btree ("donor_user_id","expires_at","created_at") WHERE "status" = 'active';
