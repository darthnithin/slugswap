import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";

import { getAdminConfigUncached } from "@/lib/server/config";
import { db } from "@/lib/server/db";
import * as schema from "@/lib/server/schema";
import {
  buildExpoPushMessages,
  parseExpoPushTickets,
  renderDonorSpendTemplate,
  serializeExpoPushTickets,
  summarizeExpoPushReceipts,
  summarizeExpoPushTickets,
  type ExpoPushReceiptSummary,
  type ExpoPushTicket,
} from "./template";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const EXPO_PUSH_CHUNK_SIZE = 100;
const EXPO_RECEIPT_CHUNK_SIZE = 1_000;
const REQUEST_TIMEOUT_MS = 10_000;
const REQUEST_MAX_ATTEMPTS = 3;
const DELIVERY_MAX_ATTEMPTS = 8;
const STALE_PROCESSING_MS = 2 * 60 * 1000;
const RECEIPT_RECHECK_MS = 60 * 1000;
const RECEIPT_MAX_WAIT_MS = 23 * 60 * 60 * 1000;
const PIPELINE_RECEIPT_DELAYS_MS = [5_000, 20_000, 60_000, 120_000] as const;
const QUEUE_SCAN_MULTIPLIER = 5;

type NotificationDelivery = typeof schema.notificationDeliveries.$inferSelect;

export type DonorSpendDeliveryResult =
  | "submitted"
  | "skipped"
  | "failed"
  | "already_processed"
  | "not_found";

export type DonorSpendReceiptResult =
  | "sent"
  | "failed"
  | "waiting"
  | "already_processing"
  | "not_found";

export type NotificationQueueResult = {
  processed: number;
  results: Record<string, number>;
};

class ExpoRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "ExpoRequestError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function chunkValues<T>(values: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

function expoHeaders(): Record<string, string> {
  const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
  return {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function postExpoJson(url: string, body: unknown): Promise<unknown> {
  let lastError: unknown = new Error("Expo request failed");

  for (let attempt = 0; attempt < REQUEST_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: expoHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const responseBody = await response.text().catch(() => "");
        throw new ExpoRequestError(
          `Expo API returned ${response.status}${responseBody ? `: ${responseBody.slice(0, 300)}` : ""}`,
          response.status === 429 || response.status >= 500
        );
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      const retryable = !(error instanceof ExpoRequestError) || error.retryable;
      if (!retryable || attempt === REQUEST_MAX_ATTEMPTS - 1) {
        throw error;
      }
      await sleep(1_000 * 2 ** attempt);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError;
}

async function postExpoPushNotifications(
  tokens: string[],
  title: string,
  body: string,
  claimCodeId: string
): Promise<ReturnType<typeof summarizeExpoPushTickets>> {
  const summary: ReturnType<typeof summarizeExpoPushTickets> = {
    errors: [],
    successfulTickets: [],
    unregisteredTokens: [],
  };

  for (const tokenChunk of chunkValues(tokens, EXPO_PUSH_CHUNK_SIZE)) {
    const payload = await postExpoJson(
      EXPO_PUSH_URL,
      buildExpoPushMessages(tokenChunk, title, body, claimCodeId)
    );
    const chunkSummary = summarizeExpoPushTickets(payload, tokenChunk);
    summary.errors.push(...chunkSummary.errors);
    summary.successfulTickets.push(...chunkSummary.successfulTickets);
    summary.unregisteredTokens.push(...chunkSummary.unregisteredTokens);
  }

  return summary;
}

async function postExpoPushReceipts(
  tickets: ExpoPushTicket[]
): Promise<ExpoPushReceiptSummary> {
  const summary: ExpoPushReceiptSummary = {
    errors: [],
    isValid: true,
    pendingTicketIds: [],
    successfulTicketIds: [],
    unregisteredTokens: [],
  };

  for (const ticketChunk of chunkValues(tickets, EXPO_RECEIPT_CHUNK_SIZE)) {
    const payload = await postExpoJson(EXPO_RECEIPTS_URL, {
      ids: ticketChunk.map(({ id }) => id),
    });
    const chunkSummary = summarizeExpoPushReceipts(payload, ticketChunk);
    summary.errors.push(...chunkSummary.errors);
    summary.isValid = summary.isValid && chunkSummary.isValid;
    summary.pendingTicketIds.push(...chunkSummary.pendingTicketIds);
    summary.successfulTicketIds.push(...chunkSummary.successfulTicketIds);
    summary.unregisteredTokens.push(...chunkSummary.unregisteredTokens);
  }

  return summary;
}

async function disablePushTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await db
    .update(schema.pushTokens)
    .set({ enabled: false, updatedAt: new Date() })
    .where(inArray(schema.pushTokens.token, [...new Set(tokens)]));
}

async function finishDelivery(
  deliveryId: string,
  status: "sent" | "failed" | "skipped",
  values: {
    title?: string;
    body?: string;
    expoTicketIds?: string | null;
    lastError?: string | null;
    submittedAt?: Date | null;
    sentAt?: Date | null;
  } = {}
): Promise<void> {
  await db
    .update(schema.notificationDeliveries)
    .set({
      status,
      ...values,
      updatedAt: new Date(),
    })
    .where(eq(schema.notificationDeliveries.id, deliveryId));
}

async function returnToSubmitted(
  deliveryId: string,
  lastError: string | null
): Promise<void> {
  await db
    .update(schema.notificationDeliveries)
    .set({
      status: "submitted",
      lastError,
      updatedAt: new Date(),
    })
    .where(eq(schema.notificationDeliveries.id, deliveryId));
}

function existingDeliveryResult(
  delivery: Pick<NotificationDelivery, "status" | "expoTicketIds"> | undefined
): DonorSpendDeliveryResult {
  if (!delivery) return "not_found";
  if (delivery.status === "submitted" || (delivery.status === "sending" && delivery.expoTicketIds)) {
    return "submitted";
  }
  return "already_processed";
}

export async function deliverDonorSpendNotification(
  claimCodeId: string
): Promise<DonorSpendDeliveryResult> {
  const now = new Date();
  const staleProcessingBefore = new Date(now.getTime() - STALE_PROCESSING_MS);
  const [delivery] = await db
    .update(schema.notificationDeliveries)
    .set({
      status: "sending",
      attemptCount: sql`${schema.notificationDeliveries.attemptCount} + 1`,
      expoTicketIds: null,
      lastError: null,
      submittedAt: null,
      sentAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.notificationDeliveries.claimCodeId, claimCodeId),
        lt(schema.notificationDeliveries.attemptCount, DELIVERY_MAX_ATTEMPTS),
        or(
          inArray(schema.notificationDeliveries.status, ["pending", "failed"]),
          and(
            eq(schema.notificationDeliveries.status, "sending"),
            isNull(schema.notificationDeliveries.expoTicketIds),
            lt(schema.notificationDeliveries.updatedAt, staleProcessingBefore)
          )
        )
      )
    )
    .returning();

  if (!delivery) {
    const existing = await db
      .select({
        status: schema.notificationDeliveries.status,
        expoTicketIds: schema.notificationDeliveries.expoTicketIds,
      })
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.claimCodeId, claimCodeId))
      .limit(1);
    return existingDeliveryResult(existing[0]);
  }

  try {
    const claimRows = await db
      .select({
        amount: schema.claimCodes.amount,
        donorUserId: schema.claimCodes.donorUserId,
        notifyOnSpend: schema.donations.notifyOnSpend,
      })
      .from(schema.claimCodes)
      .leftJoin(
        schema.donations,
        eq(schema.donations.userId, schema.claimCodes.donorUserId)
      )
      .where(eq(schema.claimCodes.id, claimCodeId))
      .limit(1);
    const claim = claimRows[0];

    if (!claim?.donorUserId || claim.notifyOnSpend !== true) {
      await finishDelivery(delivery.id, "skipped", {
        lastError: "Donor spend notifications are disabled",
      });
      return "skipped";
    }

    const tokens = await db
      .select({ token: schema.pushTokens.token })
      .from(schema.pushTokens)
      .where(
        and(
          eq(schema.pushTokens.userId, claim.donorUserId),
          eq(schema.pushTokens.enabled, true)
        )
      );

    if (tokens.length === 0) {
      await finishDelivery(delivery.id, "skipped", {
        lastError: "No enabled push token is registered for the donor",
      });
      return "skipped";
    }

    const { config } = await getAdminConfigUncached();
    const amount = Number(claim.amount);
    const title = renderDonorSpendTemplate(config.donorSpendNotificationTitle, { amount });
    const body = renderDonorSpendTemplate(config.donorSpendNotificationBody, { amount });
    const tokenValues = tokens.map(({ token }) => token);
    const summary = await postExpoPushNotifications(
      tokenValues,
      title,
      body,
      claimCodeId
    );

    await disablePushTokens(summary.unregisteredTokens);

    if (summary.successfulTickets.length === 0) {
      const failure = summary.errors.join("; ") || "Expo Push API returned no successful tickets";
      await finishDelivery(delivery.id, "failed", {
        title,
        body,
        lastError: failure,
      });
      console.warn("Failed to submit donor spend notification", { claimCodeId, failure });
      return "failed";
    }

    const submittedAt = new Date();
    await db
      .update(schema.notificationDeliveries)
      .set({
        status: "submitted",
        title,
        body,
        expoTicketIds: serializeExpoPushTickets(summary.successfulTickets),
        lastError: summary.errors.length > 0 ? summary.errors.join("; ") : null,
        submittedAt,
        updatedAt: submittedAt,
      })
      .where(eq(schema.notificationDeliveries.id, delivery.id));
    return "submitted";
  } catch (error) {
    const failure = errorMessage(error);
    await finishDelivery(delivery.id, "failed", { lastError: failure }).catch((updateError) => {
      console.error("Failed to record donor notification failure", updateError);
    });
    console.warn("Failed to submit donor spend notification", { claimCodeId, failure });
    return "failed";
  }
}

export async function processDonorSpendReceipt(
  claimCodeId: string
): Promise<DonorSpendReceiptResult> {
  const now = new Date();
  const staleProcessingBefore = new Date(now.getTime() - STALE_PROCESSING_MS);
  const [delivery] = await db
    .update(schema.notificationDeliveries)
    .set({ status: "sending", updatedAt: now })
    .where(
      and(
        eq(schema.notificationDeliveries.claimCodeId, claimCodeId),
        isNotNull(schema.notificationDeliveries.expoTicketIds),
        or(
          eq(schema.notificationDeliveries.status, "submitted"),
          and(
            eq(schema.notificationDeliveries.status, "sending"),
            lt(schema.notificationDeliveries.updatedAt, staleProcessingBefore)
          )
        )
      )
    )
    .returning();

  if (!delivery) {
    const existing = await db
      .select({ id: schema.notificationDeliveries.id })
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.claimCodeId, claimCodeId))
      .limit(1);
    return existing[0] ? "already_processing" : "not_found";
  }

  const tickets = parseExpoPushTickets(delivery.expoTicketIds);
  if (!tickets) {
    await finishDelivery(delivery.id, "failed", {
      lastError: "Stored Expo ticket mapping is invalid",
    });
    return "failed";
  }

  try {
    const summary = await postExpoPushReceipts(tickets);
    await disablePushTokens(summary.unregisteredTokens);

    if (!summary.isValid) {
      await returnToSubmitted(delivery.id, summary.errors.join("; "));
      return "waiting";
    }

    if (summary.pendingTicketIds.length > 0) {
      const submittedAt = delivery.submittedAt ?? delivery.createdAt;
      const hasExpiredReceipts = now.getTime() - submittedAt.getTime() >= RECEIPT_MAX_WAIT_MS;
      if (hasExpiredReceipts) {
        await finishDelivery(delivery.id, "failed", {
          lastError: `Expo receipts were unavailable for ${summary.pendingTicketIds.length} ticket(s)`,
        });
        return "failed";
      }

      const pendingMessage = `Waiting for ${summary.pendingTicketIds.length} Expo receipt(s)`;
      await returnToSubmitted(
        delivery.id,
        [...summary.errors, pendingMessage].join("; ")
      );
      return "waiting";
    }

    if (summary.successfulTicketIds.length === 0) {
      const failure = summary.errors.join("; ") || "Expo rejected every push receipt";
      await finishDelivery(delivery.id, "failed", { lastError: failure });
      return "failed";
    }

    await finishDelivery(delivery.id, "sent", {
      lastError: summary.errors.length > 0 ? summary.errors.join("; ") : null,
      sentAt: new Date(),
    });
    return "sent";
  } catch (error) {
    const failure = errorMessage(error);
    await returnToSubmitted(delivery.id, failure).catch((updateError) => {
      console.error("Failed to record donor notification receipt error", updateError);
    });
    console.warn("Failed to check donor notification receipt", { claimCodeId, failure });
    return "waiting";
  }
}

export async function runDonorSpendDeliveryPipeline(
  claimCodeId: string
): Promise<DonorSpendDeliveryResult | DonorSpendReceiptResult> {
  const deliveryResult = await deliverDonorSpendNotification(claimCodeId);
  if (deliveryResult !== "submitted") return deliveryResult;

  for (const delayMs of PIPELINE_RECEIPT_DELAYS_MS) {
    await sleep(delayMs);
    const receiptResult = await processDonorSpendReceipt(claimCodeId);
    if (receiptResult === "sent" || receiptResult === "failed" || receiptResult === "not_found") {
      return receiptResult;
    }
  }

  return "waiting";
}

function retryDelayMs(attemptCount: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attemptCount - 1), 6 * 60 * 60 * 1000);
}

function isQueueCandidateDue(delivery: NotificationDelivery, now: Date): boolean {
  const ageMs = now.getTime() - delivery.updatedAt.getTime();
  if (delivery.status === "pending") return true;
  if (delivery.status === "failed") {
    return (
      delivery.attemptCount < DELIVERY_MAX_ATTEMPTS &&
      ageMs >= retryDelayMs(delivery.attemptCount)
    );
  }
  if (delivery.status === "submitted") return ageMs >= RECEIPT_RECHECK_MS;
  if (delivery.status === "sending") return ageMs >= STALE_PROCESSING_MS;
  return false;
}

export async function processDonorSpendNotificationQueue(
  limit = 10
): Promise<NotificationQueueResult> {
  const now = new Date();
  const candidates = await db
    .select()
    .from(schema.notificationDeliveries)
    .where(
      inArray(schema.notificationDeliveries.status, [
        "pending",
        "failed",
        "submitted",
        "sending",
      ])
    )
    .orderBy(asc(schema.notificationDeliveries.updatedAt))
    .limit(limit * QUEUE_SCAN_MULTIPLIER);
  const due = candidates.filter((delivery) => isQueueCandidateDue(delivery, now)).slice(0, limit);

  const outcomes = await Promise.all(
    due.map(async (delivery) => {
      if (
        delivery.status === "submitted" ||
        (delivery.status === "sending" && delivery.expoTicketIds)
      ) {
        return processDonorSpendReceipt(delivery.claimCodeId);
      }
      return runDonorSpendDeliveryPipeline(delivery.claimCodeId);
    })
  );
  const results: Record<string, number> = {};
  for (const outcome of outcomes) {
    results[outcome] = (results[outcome] ?? 0) + 1;
  }

  return { processed: outcomes.length, results };
}
