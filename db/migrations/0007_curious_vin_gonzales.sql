CREATE TABLE "facility_occupancy_samples" (
	"slot" timestamp with time zone NOT NULL,
	"facility_id" uuid NOT NULL,
	"status" text NOT NULL,
	"occupancy" integer,
	"capacity" integer,
	"ratio" numeric,
	"error" text,
	CONSTRAINT "occupancy_sample_status_valid" CHECK ("facility_occupancy_samples"."status" in ('ok', 'missing', 'invalid')),
	CONSTRAINT "occupancy_sample_values_valid" CHECK ((
    "facility_occupancy_samples"."status" = 'ok' and "facility_occupancy_samples"."occupancy" is not null and "facility_occupancy_samples"."occupancy" >= 0
      and "facility_occupancy_samples"."capacity" is not null and "facility_occupancy_samples"."capacity" > 0
      and "facility_occupancy_samples"."ratio" is not null and "facility_occupancy_samples"."ratio" >= 0
  ) or (
    "facility_occupancy_samples"."status" in ('missing', 'invalid') and "facility_occupancy_samples"."occupancy" is null
      and "facility_occupancy_samples"."capacity" is null and "facility_occupancy_samples"."ratio" is null
  ))
);
--> statement-breakpoint
CREATE TABLE "occupancy_collection_runs" (
	"slot" timestamp with time zone PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fetched_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"http_status" integer,
	"error" text,
	"parser_version" text NOT NULL,
	CONSTRAINT "occupancy_run_status_valid" CHECK ("occupancy_collection_runs"."status" in ('running', 'success', 'partial', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "facility_occupancy_samples" ADD CONSTRAINT "facility_occupancy_samples_slot_occupancy_collection_runs_slot_fk" FOREIGN KEY ("slot") REFERENCES "public"."occupancy_collection_runs"("slot") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "occupancy_samples_slot_facility_unique" ON "facility_occupancy_samples" USING btree ("slot","facility_id");--> statement-breakpoint
CREATE INDEX "occupancy_samples_facility_slot_idx" ON "facility_occupancy_samples" USING btree ("facility_id","slot");