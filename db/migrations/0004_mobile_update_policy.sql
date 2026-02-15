ALTER TABLE "admin_config"
ADD COLUMN IF NOT EXISTS "ios_required_version" text NOT NULL DEFAULT '1.0.0',
ADD COLUMN IF NOT EXISTS "android_required_version" text NOT NULL DEFAULT '1.0.0',
ADD COLUMN IF NOT EXISTS "ios_store_url" text,
ADD COLUMN IF NOT EXISTS "android_store_url" text;
