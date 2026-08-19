import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

function preserveStrictTlsSemantics(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
    const usesLibpqCompatibility =
      url.searchParams.get("uselibpqcompat")?.toLowerCase() === "true";

    // pg currently treats these modes as verify-full aliases, but its next
    // major will adopt weaker libpq semantics. Make the existing strict
    // certificate and hostname verification explicit.
    if (
      !usesLibpqCompatibility &&
      (sslMode === "prefer" || sslMode === "require" || sslMode === "verify-ca")
    ) {
      url.searchParams.set("sslmode", "verify-full");
    }

    return url.toString();
  } catch {
    return connectionString;
  }
}

function createDatabase() {
  const configuredConnectionString = process.env.DATABASE_URL;
  if (!configuredConnectionString) {
    throw new Error("DATABASE_URL is not configured");
  }
  const connectionString = preserveStrictTlsSemantics(configuredConnectionString);

  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  // Fluid Compute reuses this pool across concurrent invocations and closes
  // idle connections before the function instance is suspended.
  attachDatabasePool(pool);

  return drizzle(pool, { schema });
}

type Database = ReturnType<typeof createDatabase>;

let database: Database | null = null;

export function getDb(): Database {
  database ??= createDatabase();
  return database;
}

// Keep the existing `db.select(...)` call sites while deferring environment
// validation and pool creation until the first real query.
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const instance = getDb();
    const value = Reflect.get(instance, property, instance) as unknown;
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
