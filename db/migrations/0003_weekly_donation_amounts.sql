-- Convert legacy monthly donation amounts to weekly amounts.
-- We use a simple 4-week normalization and round to cents.
UPDATE "donations"
SET
  "amount" = round(("amount" / 4.0)::numeric, 2),
  "updated_at" = now();
