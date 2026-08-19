import { eq } from "drizzle-orm";
import { db } from "./db";
import { weeklyPools } from "./schema";
import { getPacificWeekWindow } from "./timezone";

type WeeklyPool = typeof weeklyPools.$inferSelect;

export async function findCurrentWeeklyPool(
  reference = new Date()
): Promise<WeeklyPool | null> {
  const { weekStart } = getPacificWeekWindow(reference);
  const [pool] = await db
    .select()
    .from(weeklyPools)
    .where(eq(weeklyPools.weekStart, weekStart))
    .limit(1);

  return pool ?? null;
}

export async function getOrCreateCurrentWeeklyPool(
  reference = new Date()
): Promise<WeeklyPool> {
  const { weekStart, weekEnd } = getPacificWeekWindow(reference);
  const existing = await findCurrentWeeklyPool(reference);
  if (existing) return existing;

  const [created] = await db
    .insert(weeklyPools)
    .values({
      weekStart,
      weekEnd,
      totalAmount: "0",
      allocatedAmount: "0",
      remainingAmount: "0",
    })
    .onConflictDoNothing({ target: weeklyPools.weekStart })
    .returning();

  if (created) return created;

  const concurrent = await findCurrentWeeklyPool(reference);
  if (!concurrent) {
    throw new Error("Failed to load the current weekly pool");
  }
  return concurrent;
}
