import { attachDatabasePool } from "@vercel/functions";
import { Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleNeonServerless } from "drizzle-orm/neon-serverless";
import {
  drizzle as drizzleNodePostgres,
  type NodePgDatabase,
} from "drizzle-orm/node-postgres";
import { Pool as NodePostgresPool } from "pg";
import * as schema from "./schema";

type Database = NodePgDatabase<typeof schema>;

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

function createDatabase(): Database {
  const configuredConnectionString = process.env.DATABASE_URL;
  if (!configuredConnectionString) {
    throw new Error("DATABASE_URL is not configured");
  }
  const connectionString = preserveStrictTlsSemantics(configuredConnectionString);

  // Vercel Fluid Compute supports persistent TCP pools. Local development can
  // run on networks that allow HTTPS/WebSockets but block PostgreSQL traffic,
  // so use Neon's node-postgres-compatible WebSocket pool outside Vercel.
  if (process.env.VERCEL !== "1") {
    const pool = new NeonPool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });

    return drizzleNeonServerless(pool, { schema }) as unknown as Database;
  }

  const pool = new NodePostgresPool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  // Fluid Compute reuses this pool across concurrent invocations and closes
  // idle connections before the function instance is suspended.
  attachDatabasePool(pool);

  return drizzleNodePostgres(pool, { schema });
}

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
