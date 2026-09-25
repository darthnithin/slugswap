# Facility occupancy recording

Records the public UCSC recreation page every 30 minutes. A Supabase Edge Function parses all 15 known occupancy facilities in one request and writes observations to SlugSwap's existing Neon database. The admin graph is at `/admin/occupancy`.

## Hosting

- Neon project: `quiet-wind-08627317`, existing Oregon database. Neon Functions did not support this region at implementation time, so the collector runs on Supabase.
- Supabase project: `htaktvkkxeylaelyvxoz` (SlugSwap).
- Edge Function: `facility-occupancy`.
- Cron job: `slugswap-facility-occupancy`, `0,30 * * * *` (UTC; also every half hour in Pacific time).
- Source: https://campusrec.ucsc.edu/FacilityOccupancy

The graph and API require the existing admin session. The graph supports 24 hours, 7 days, and 30 days, facility selection, CSV export, and an accessible readings table. No historical data can be reconstructed before collection began. The first few days of the graph will consequently be sparse.

## Data semantics

`occupancy_collection_runs` stores each half-hour slot, actual fetch time, status, source HTTP status, error, and parser version. `facility_occupancy_samples` stores per-facility status and nullable count/capacity/ratio. Missing or invalid readings are never converted to zero. Capacity is captured with each sample rather than assumed constant.

UCSC renders duplicate desktop/mobile canvases. Both must agree. A missing attribute, duplicate facility, inconsistent ratio, or malformed number rejects that facility, while the other facilities can still be recorded. Zero counts are retained. Over-capacity counts are not clamped.

A unique slot and an attempt UUID prevent duplicate deliveries from making duplicate records. Completed collections are immutable. Failed runs can be retried in the current slot; a running lease can be reclaimed after three minutes. Source fetches have a 20-second timeout and at most one retry. Database commit failures leave a running lease, which a subsequent invocation can reclaim. A missed historical slot stays a gap.

UCSC provides no source update timestamp. Our fetch time is not proof of source freshness. Flat readings may mean unchanged occupancy or an unmaintained source. The graph shows missing intervals, an old-observation notice after 75 minutes, and an unchanged-values notice after four identical samples. These notices are visible in the graph; no separate alert service has been configured.

## Secrets and permissions

The Edge Function uses custom bearer authentication (`verify_jwt=false` is intentional). Missing or incorrect credentials are rejected; public Supabase keys are insufficient.

- `OCCUPANCY_CRON_SECRET`: random private Edge Function secret.
- Supabase Vault secret `slugswap_occupancy_cron_secret`: matching value for the scheduler.
- `OCCUPANCY_DATABASE_URL`: Neon login `slugswap_occupancy_collector`, with only schema usage and SELECT/INSERT/UPDATE on the two occupancy tables. It cannot read user data.

Use `supabase secrets set --project-ref htaktvkkxeylaelyvxoz --env-file <private-env-file>` to configure secrets. Keep that file out of version control. Never expose these values through `EXPO_PUBLIC_` or `NEXT_PUBLIC_` variables.

## Development and validation

From the repo root:

```sh
npm install
npm run occupancy:test
npm run dashboard:typecheck
npm run db:migrations:check
npm run db:audit
npx tsx scripts/occupancy/integration-check.mts
```

The integration check creates disposable test tables in a uniquely named schema, verifies concurrency, gaps, legitimate zeros, retries, and constraints, then drops only its own schema. It needs the owner `DATABASE_URL` in `.env`; the deployed collector role deliberately cannot create schemas.

`db/schema.ts` is the schema source of truth. Migration `0007_curious_vin_gonzales.sql` adds only the two occupancy tables. `scripts/occupancy/schema.sql` is the isolated integration-test schema. If either schema changes, keep the test fixture aligned.

For a new environment: run `npm run db:audit`, review the migration on a Neon branch or backup, then `npm run db:push`. For the existing production database, the additive migration was applied directly after the audit and isolated-schema integration check; do not reapply it. The pre-change schema baseline is saved locally under `tmp/occupancy/schema-before.json`.

## Deployment

Deploy the collector independently of the dashboard:

```sh
npx supabase functions deploy facility-occupancy \
  --project-ref htaktvkkxeylaelyvxoz --use-api --no-verify-jwt \
  --import-map supabase/functions/facility-occupancy/deno.json
```

After secrets are configured, enable/update the schedule with:

```sh
npx supabase db query --project-ref htaktvkkxeylaelyvxoz --linked \
  --file supabase/occupancy-cron.sql
```

The named job is updated in place. For the graph, deploy the dashboard with `npm run dashboard:deploy` (preview) or `npm run dashboard:deploy:prod` (production), or use the Git-connected Vercel deployment. No mobile OTA/build is needed.

## Operations

Review `cron.job_run_details` for scheduler execution, but remember success there only means the HTTP request was enqueued. Confirm the corresponding `net._http_response` is HTTP 200 and that Neon contains a completed run with the expected samples. HTTP 502 means UCSC fetch/parsing yielded no valid observations; HTTP 500 means the collector could not complete its database work.

Pause recording without deleting history:

```sql
SELECT cron.alter_job(jobid, active := false)
FROM cron.job WHERE jobname = 'slugswap-facility-occupancy';
```

Re-enable with `active := true`. Do not backfill missed periods using current readings. Raw observations are retained without automatic deletion; at 15 facilities this is about 21,600 samples per 30 days. The history endpoint is limited to 30 days per query.
