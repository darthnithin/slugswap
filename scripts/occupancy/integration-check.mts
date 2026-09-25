// Uses isolated tables in a disposable schema. No production observations are changed.
import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { neon } from "@neondatabase/serverless";
loadEnvFile(".env");
const sql = neon(process.env.DATABASE_URL!);
const schema = `occupancy_test_${crypto.randomUUID().replaceAll("-", "")}`;
const modulePath = new URL(
  "../../packages/occupancy/src/.integration-core.ts",
  import.meta.url,
);
const qualify = (s: string) =>
  s.replaceAll(
    /\b(occupancy_collection_runs|facility_occupancy_samples)\b/g,
    `${schema}.$1`,
  );
await sql.query(`CREATE SCHEMA ${schema}`);
try {
  const statements = qualify(
    await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
  )
    .split(";")
    .filter((s) => s.trim());
  await sql.transaction(statements.map((s) => sql.query(s)));
  const source = qualify(
    await readFile(
      new URL("../../packages/occupancy/src/core.ts", import.meta.url),
      "utf8",
    ),
  );
  await writeFile(modulePath, source);
  const { collectOccupancy, getOccupancyHistory, FACILITIES } = await import(
    modulePath.href
  );
  const fakeHtml = FACILITIES.map(
    (f: { id: string }) =>
      `<div data-facilityid="${f.id}"><canvas class="occupancy-chart" data-occupancy="0" data-remaining="150" data-ratio="0"></canvas></div>`,
  ).join("");
  let requests = 0;
  const fetcher = async () => {
    requests++;
    return new Response(fakeHtml);
  };
  const [a, b] = await Promise.all([
    collectOccupancy(process.env.DATABASE_URL!, fetcher),
    collectOccupancy(process.env.DATABASE_URL!, fetcher),
  ]);
  assert.deepEqual([a.status, b.status].sort(), ["duplicate", "success"]);
  assert.equal(requests, 1);
  const counts = await sql.query(
    `SELECT count(*)::integer AS n FROM ${schema}.facility_occupancy_samples`,
  );
  assert.equal(counts[0].n, 15);
  let history = await getOccupancyHistory(
    process.env.DATABASE_URL!,
    FACILITIES[0].id,
    7,
  );
  assert.equal(history.points.length, 1);
  assert.equal(history.points[0].occupancy, 0);
  // A historical failure followed by an absent interval must produce two gaps.
  await sql.query(`INSERT INTO ${schema}.occupancy_collection_runs (slot,attempt_id,status,parser_version)
    SELECT slot - interval '1 hour', gen_random_uuid(), 'failed', 'test' FROM ${schema}.occupancy_collection_runs LIMIT 1`);
  history = await getOccupancyHistory(
    process.env.DATABASE_URL!,
    FACILITIES[0].id,
    7,
  );
  assert.deepEqual(
    history.points.map((p: { status: string }) => p.status),
    ["failed", "missed", "ok"],
  );
  assert.deepEqual(
    history.points.map((p: { occupancy: number | null }) => p.occupancy),
    [null, null, 0],
  );
  // A failed current run is retryable, but successful data is never overwritten.
  await sql.query(
    `UPDATE ${schema}.occupancy_collection_runs SET status='failed' WHERE slot=(SELECT max(slot) FROM ${schema}.occupancy_collection_runs)`,
  );
  assert.equal(
    (await collectOccupancy(process.env.DATABASE_URL!, fetcher)).status,
    "success",
  );
  assert.equal(
    (
      await sql.query(
        `SELECT count(*)::integer AS n FROM ${schema}.facility_occupancy_samples`,
      )
    )[0].n,
    15,
  );
  await assert.rejects(() =>
    sql.query(
      `INSERT INTO ${schema}.facility_occupancy_samples (slot,facility_id,status,occupancy,capacity,ratio) SELECT max(slot),gen_random_uuid(),'ok',-1,100,0 FROM ${schema}.occupancy_collection_runs`,
    ),
  );
  console.log(
    "PASS: isolated schema, concurrent delivery deduplication, zero preservation, missing intervals, failure recovery, and count constraints.",
  );
} finally {
  await sql.query(`DROP SCHEMA ${schema} CASCADE`);
  await unlink(modulePath).catch(() => {});
}
