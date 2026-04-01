DELETE FROM "redemptions" a
USING "redemptions" b
WHERE a.ctid < b.ctid
  AND a.claim_code_id = b.claim_code_id;
--> statement-breakpoint
CREATE UNIQUE INDEX "redemptions_claim_code_id_unique" ON "redemptions" USING btree ("claim_code_id");
