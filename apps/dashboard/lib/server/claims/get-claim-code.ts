import { callGetApi, GetApiError } from "@/lib/server/get/tools";
import { getActiveGetSession } from "@/lib/server/get/session";

function durationMs(startedAt: number): number {
  return Date.now() - startedAt;
}

function logBarcodeFetchTiming(payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.info("[claims.barcode-fetch.timing]", payload);
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
  userId: string,
  claimCodeTtlMs: number,
  existingSessionId?: string
): Promise<{ code: string; expiresAt: Date; sessionId: string }> {
  const startedAt = Date.now();
  const { sessionId } = existingSessionId
    ? { sessionId: existingSessionId }
    : await getActiveGetSession(userId);
  const fetchStartedAt = Date.now();
  const payload = await callGetApi<{ sessionId: string }, unknown>(
    "authentication",
    "retrievePatronBarcodePayload",
    { sessionId }
  );

  const code = extractBarcodePayload(payload);
  if (!code) {
    throw new GetApiError("GET provider returned an empty barcode payload");
  }

  const expiresAt = new Date(Date.now() + claimCodeTtlMs);
  logBarcodeFetchTiming({
    userId,
    usedExistingSession: !!existingSessionId,
    getBarcodeMs: durationMs(fetchStartedAt),
    totalMs: durationMs(startedAt),
  });
  return { code, expiresAt, sessionId };
}
