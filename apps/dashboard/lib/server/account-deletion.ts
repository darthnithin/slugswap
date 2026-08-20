import { eq, inArray, or } from "drizzle-orm";
import { db } from "./db";
import { decryptSecret } from "./get/credentials";
import { authenticatePin, revokePin } from "./get/tools";
import * as schema from "./schema";

type DeletionStep = () => Promise<void>;

export async function runAccountDeletion(
  revokeLinkedAccount: DeletionStep,
  deleteStoredData: DeletionStep,
  deleteIdentity: DeletionStep
): Promise<void> {
  try {
    await revokeLinkedAccount();
  } catch (error) {
    // The third-party GET link should not prevent a user from deleting the
    // SlugSwap data and identity that we control.
    console.warn("GET credential revocation failed during account deletion:", error);
  }

  await deleteStoredData();
  await deleteIdentity();
}

export async function revokeLinkedGetAccount(userId: string): Promise<void> {
  const credential = await db.query.getCredentials.findFirst({
    where: eq(schema.getCredentials.userId, userId),
  });

  if (!credential) return;

  const pin = decryptSecret(credential.encryptedPin);
  const sessionId = await authenticatePin(pin, credential.deviceId);
  await revokePin(sessionId, credential.deviceId);
}

export async function deleteStoredAccountData(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Lock the parent row so a concurrent request cannot create a new child
    // record while deletion is in progress.
    await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .for("update");

    const requesterClaims = await tx
      .select({ id: schema.claimCodes.id })
      .from(schema.claimCodes)
      .where(eq(schema.claimCodes.userId, userId));
    const requesterClaimIds = requesterClaims.map(({ id }) => id);

    if (requesterClaimIds.length > 0) {
      await tx
        .delete(schema.notificationDeliveries)
        .where(
          or(
            inArray(schema.notificationDeliveries.claimCodeId, requesterClaimIds),
            eq(schema.notificationDeliveries.donorUserId, userId)
          )
        );
      await tx
        .delete(schema.redemptions)
        .where(
          or(
            inArray(schema.redemptions.claimCodeId, requesterClaimIds),
            eq(schema.redemptions.userId, userId)
          )
        );
    } else {
      await tx
        .delete(schema.notificationDeliveries)
        .where(eq(schema.notificationDeliveries.donorUserId, userId));
      await tx
        .delete(schema.redemptions)
        .where(eq(schema.redemptions.userId, userId));
    }

    // Requests belong to the requesting user and are removed outright.
    await tx
      .delete(schema.claimCodes)
      .where(eq(schema.claimCodes.userId, userId));

    // Claims requested by another student remain as deidentified transaction
    // history. Remove the donor link and the balance snapshot.
    await tx
      .update(schema.claimCodes)
      .set({ donorUserId: null, balanceSnapshot: null })
      .where(eq(schema.claimCodes.donorUserId, userId));

    await tx
      .delete(schema.pushTokens)
      .where(eq(schema.pushTokens.userId, userId));
    await tx
      .delete(schema.userAllowances)
      .where(eq(schema.userAllowances.userId, userId));
    await tx
      .delete(schema.donations)
      .where(eq(schema.donations.userId, userId));
    await tx
      .delete(schema.getCredentials)
      .where(eq(schema.getCredentials.userId, userId));
    await tx.delete(schema.users).where(eq(schema.users.id, userId));
  });
}
