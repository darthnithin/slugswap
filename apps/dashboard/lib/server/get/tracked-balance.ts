import { and, eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { donations } from "@/lib/server/schema";
import { getActiveGetSession } from "@/lib/server/get/session";
import { type GetAccount } from "@/lib/server/get/tools";
import { retrieveAccounts } from "@/lib/server/get/tools";

export const TRACKED_BALANCE_ACCOUNT_NAMES = new Set([
  "flexi dollars",
  "banana bucks",
  "slug points",
]);

export function getTrackedBalanceTotal(accounts: GetAccount[]): number | null {
  const tracked = accounts.filter((account) =>
    TRACKED_BALANCE_ACCOUNT_NAMES.has(account.accountDisplayName.trim().toLowerCase())
  );

  let total = 0;
  let found = false;
  for (const account of tracked) {
    if (typeof account.balance !== "number" || Number.isNaN(account.balance)) continue;
    total += account.balance;
    found = true;
  }

  return found ? total : null;
}

export async function syncDonorPauseStateFromAccounts(
  donorUserId: string,
  accounts: GetAccount[]
): Promise<{ trackedBalance: number | null; autoPaused: boolean }> {
  const trackedBalance = getTrackedBalanceTotal(accounts);
  if (trackedBalance == null || trackedBalance > 0) {
    return { trackedBalance, autoPaused: false };
  }

  const [updated] = await db
    .update(donations)
    .set({
      status: "paused",
      updatedAt: new Date(),
    })
    .where(and(eq(donations.userId, donorUserId), eq(donations.status, "active")))
    .returning({ userId: donations.userId });

  return {
    trackedBalance,
    autoPaused: !!updated,
  };
}

export async function fetchLiveTrackedBalance(
  donorUserId: string
): Promise<number | null> {
  const { sessionId } = await getActiveGetSession(donorUserId);
  const accounts = await retrieveAccounts(sessionId);
  const { trackedBalance } = await syncDonorPauseStateFromAccounts(donorUserId, accounts);
  return trackedBalance ?? getTrackedBalanceTotal(accounts);
}
