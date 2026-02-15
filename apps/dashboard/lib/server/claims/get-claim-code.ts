import { callGetApi } from "@/lib/server/get/tools";
import { getActiveGetSession } from "@/lib/server/get/session";

const CLAIM_CODE_TTL_MS = 60_000;

function generateFallbackCode(): string {
  return `SLUG${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
}

function extractBarcodePayload(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw === "object") {
    const maybe = raw as { payload?: string; barcodePayload?: string };
    const value = maybe.payload || maybe.barcodePayload;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export async function fetchLiveClaimCodeFromGet(
  userId: string
): Promise<{ code: string; expiresAt: Date; sessionId: string }> {
  const { sessionId } = await getActiveGetSession(userId);
  const payload = await callGetApi<{ sessionId: string }, unknown>(
    "authentication",
    "retrievePatronBarcodePayload",
    { sessionId }
  );

  const code = extractBarcodePayload(payload) || generateFallbackCode();
  const expiresAt = new Date(Date.now() + CLAIM_CODE_TTL_MS);
  return { code, expiresAt, sessionId };
}
