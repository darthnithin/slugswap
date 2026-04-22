import { retrievePatronBarcodePayload } from "@/lib/server/get/tools";
import { getActiveGetSession } from "@/lib/server/get/session";

function durationMs(startedAt: number): number {
  return Date.now() - startedAt;
}

function logBarcodeFetchTiming(payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.info("[claims.barcode-fetch.timing]", payload);
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
  const code = await retrievePatronBarcodePayload(sessionId);

  const expiresAt = new Date(Date.now() + claimCodeTtlMs);
  logBarcodeFetchTiming({
    userId,
    usedExistingSession: !!existingSessionId,
    getBarcodeMs: durationMs(fetchStartedAt),
    totalMs: durationMs(startedAt),
  });
  return { code, expiresAt, sessionId };
}
