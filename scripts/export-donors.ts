import { createDecipheriv, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------

const sql = neon(process.env.DATABASE_URL!);

// ---------------------------------------------------------------------------
// Credential decryption (mirrors apps/dashboard/lib/server/get/credentials.ts)
// ---------------------------------------------------------------------------

function decryptPin(payload: string): string {
  const secret = process.env.GET_CREDENTIAL_SECRET;
  if (!secret) throw new Error("GET_CREDENTIAL_SECRET is not set");
  const key = createHash("sha256").update(secret).digest();
  const [ivBase64, tagBase64, dataBase64] = payload.split(":");
  if (!ivBase64 || !tagBase64 || !dataBase64) throw new Error("Invalid encrypted credential format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

// ---------------------------------------------------------------------------
// GET API (mirrors apps/dashboard/lib/server/get/tools.ts)
// ---------------------------------------------------------------------------

const GET_BASE_URL =
  process.env.GET_API_BASE_URL ||
  "https://services.get.cbord.com/GETServices/services/json";

async function callGet<P, R>(service: string, method: string, params: P): Promise<R> {
  const res = await fetch(`${GET_BASE_URL}/${service}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ method, params }),
  });
  const body = (await res.json()) as { response?: R; exception?: { message?: string } };
  if (body?.exception) throw new Error(body.exception.message ?? `GET ${method} error`);
  return body?.response as R;
}

async function authenticatePin(pin: string, deviceId: string): Promise<string> {
  return callGet<object, string>("authentication", "authenticatePIN", {
    pin,
    deviceId,
    systemCredentials: {
      userName: process.env.GET_SYSTEM_USERNAME ?? "get_mobile",
      password: process.env.GET_SYSTEM_PASSWORD ?? "NOTUSED",
      domain: process.env.GET_SYSTEM_DOMAIN ?? "",
    },
  });
}

type GetAccount = { accountDisplayName: string; balance: number | null; isActive: boolean };

async function retrieveAccounts(sessionId: string): Promise<GetAccount[]> {
  const raw = await callGet<object, GetAccount[] | { accounts?: GetAccount[] }>(
    "commerce",
    "retrieveAccounts",
    { sessionId }
  );
  return Array.isArray(raw) ? raw : (raw?.accounts ?? []);
}

const TRACKED_NAMES = new Set(["flexi dollars", "banana bucks", "slug points"]);

function trackedBalance(accounts: GetAccount[]): number | null {
  let total = 0;
  let found = false;
  for (const a of accounts) {
    if (!TRACKED_NAMES.has(a.accountDisplayName.trim().toLowerCase())) continue;
    if (typeof a.balance !== "number" || Number.isNaN(a.balance)) continue;
    total += a.balance;
    found = true;
  }
  return found ? total : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

type DonorRow = {
  user_id: string;
  email: string;
  name: string | null;
  device_id: string;
  encrypted_pin: string;
};

async function main() {
  console.error("Fetching past donors with GET credentials from DB...");

  const rows = (await sql`
    SELECT
      u.id          AS user_id,
      u.email,
      u.name,
      gc.device_id,
      gc.encrypted_pin
    FROM get_credentials gc
    JOIN users u ON u.id = gc.user_id
    ORDER BY u.email
  `) as DonorRow[];

  console.error(`Found ${rows.length} eligible donor(s). Fetching GET balances...`);

  const csvLines: string[] = ["email,username,get_balance"];

  for (const row of rows) {
    const label = row.email;
    try {
      const pin = decryptPin(row.encrypted_pin);
      const sessionId = await authenticatePin(pin, row.device_id);
      const accounts = await retrieveAccounts(sessionId);
      const balance = trackedBalance(accounts);
      const balanceStr = balance === null ? "" : String(balance);
      csvLines.push(`${escapeCsv(row.email)},${escapeCsv(row.name ?? "")},${balanceStr}`);
      console.error(`  ✓ ${label}  balance=${balanceStr}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      csvLines.push(`${escapeCsv(row.email)},${escapeCsv(row.name ?? "")},ERROR: ${escapeCsv(msg)}`);
      console.error(`  ✗ ${label}  ${msg}`);
    }
  }

  const output = csvLines.join("\n") + "\n";

  const outFile = process.argv[2];
  if (outFile) {
    writeFileSync(outFile, output, "utf8");
    console.error(`\nCSV written to ${outFile}`);
  } else {
    process.stdout.write(output);
  }
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
