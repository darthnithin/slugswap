// Additive migration only. Run the audit and integration check first.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { neon } from "@neondatabase/serverless";
loadEnvFile(".env");
const sql = neon(process.env.DATABASE_URL!);
const existing =
  await sql`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('occupancy_collection_runs','facility_occupancy_samples')`;
if (existing.length)
  throw new Error(
    "Occupancy tables already exist; inspect before applying again.",
  );
const snapshot =
  await sql`SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position`;
await mkdir("tmp/occupancy", { recursive: true });
await writeFile(
  "tmp/occupancy/schema-before.json",
  JSON.stringify(snapshot, null, 2),
);
const migration = await readFile(
  "db/migrations/0007_curious_vin_gonzales.sql",
  "utf8",
);
if (!process.argv.includes("--apply")) {
  console.log(
    "Saved schema baseline. Apply creates only the two occupancy tables and their constraints/indexes.",
  );
  console.log(migration);
} else {
  await sql.transaction(
    migration
      .split("--> statement-breakpoint")
      .filter((q) => q.trim())
      .map((q) => sql.query(q)),
  );
  const after =
    await sql`SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema='public'
      AND table_name NOT IN ('occupancy_collection_runs','facility_occupancy_samples') ORDER BY table_name, ordinal_position`;
  if (JSON.stringify(snapshot) !== JSON.stringify(after))
    throw new Error("Unexpected schema difference; inspect baseline.");
  console.log(
    "Created occupancy tables. Existing table definitions are unchanged.",
  );
}
