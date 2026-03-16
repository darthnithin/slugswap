ALTER TABLE "donations"
ADD COLUMN IF NOT EXISTS "notify_on_spend" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"installation_id" text NOT NULL,
	"channel" text NOT NULL,
	"platform" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expo_push_token" text,
	"web_push_subscription" jsonb,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_installations_installation_id_unique" UNIQUE("installation_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_installations" ADD CONSTRAINT "notification_installations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$
BEGIN
 IF EXISTS (
   SELECT 1
   FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'donor_push_devices'
 ) THEN
   INSERT INTO "notification_installations" (
     "user_id",
     "installation_id",
     "channel",
     "platform",
     "status",
     "expo_push_token",
     "last_seen_at",
     "created_at",
     "updated_at"
   )
   SELECT
     "user_id",
     CONCAT('legacy:', "id"::text),
     'expo',
     "platform",
     CASE WHEN "status" = 'active' THEN 'active' ELSE 'invalid' END,
     "expo_push_token",
     "last_seen_at",
     "created_at",
     "updated_at"
   FROM "donor_push_devices"
   ON CONFLICT ("installation_id") DO NOTHING;
 END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "donor_spend_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_code_id" uuid NOT NULL,
	"donor_user_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	CONSTRAINT "donor_spend_notifications_claim_code_id_unique" UNIQUE("claim_code_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "donor_spend_notifications" ADD CONSTRAINT "donor_spend_notifications_claim_code_id_claim_codes_id_fk" FOREIGN KEY ("claim_code_id") REFERENCES "public"."claim_codes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "donor_spend_notifications" ADD CONSTRAINT "donor_spend_notifications_donor_user_id_users_id_fk" FOREIGN KEY ("donor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notification_installations_user_status" ON "notification_installations" USING btree ("user_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notification_installations_user_installation" ON "notification_installations" USING btree ("user_id","installation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_donor_spend_notifications_user_created" ON "donor_spend_notifications" USING btree ("donor_user_id","created_at");
