import { pgTable, uuid, text, timestamp, decimal, integer } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const donations = pgTable("donations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const weeklyPools = pgTable("weekly_pools", {
  id: uuid("id").primaryKey().defaultRandom(),
  weekStart: timestamp("week_start").notNull().unique(),
  weekEnd: timestamp("week_end").notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  allocatedAmount: decimal("allocated_amount", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  remainingAmount: decimal("remaining_amount", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const claimCodes = pgTable("claim_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  weeklyPoolId: uuid("weekly_pool_id")
    .references(() => weeklyPools.id)
    .notNull(),
  donorUserId: uuid("donor_user_id").references(() => users.id),
  code: text("code").notNull().unique(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  redeemedAt: timestamp("redeemed_at"),
  balanceSnapshot: text("balance_snapshot"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const redemptions = pgTable("redemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  claimCodeId: uuid("claim_code_id")
    .references(() => claimCodes.id)
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  redeemedAt: timestamp("redeemed_at").defaultNow().notNull(),
  getToolsTransactionId: text("get_tools_transaction_id"),
});

export const userAllowances = pgTable("user_allowances", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  weeklyPoolId: uuid("weekly_pool_id")
    .references(() => weeklyPools.id)
    .notNull(),
  weeklyLimit: decimal("weekly_limit", { precision: 10, scale: 2 }).notNull(),
  usedAmount: decimal("used_amount", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const getCredentials = pgTable("get_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull()
    .unique(),
  deviceId: text("device_id").notNull(),
  encryptedPin: text("encrypted_pin").notNull(),
  linkedAt: timestamp("linked_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const adminConfig = pgTable("admin_config", {
  id: text("id").primaryKey().default("global"),
  defaultWeeklyAllowance: integer("default_weekly_allowance").notNull().default(50),
  defaultClaimAmount: integer("default_claim_amount").notNull().default(10),
  codeExpiryMinutes: integer("code_expiry_minutes").notNull().default(5),
  poolCalculationMethod: text("pool_calculation_method").notNull().default("equal"),
  maxClaimsPerDay: integer("max_claims_per_day").notNull().default(5),
  minDonationAmount: integer("min_donation_amount").notNull().default(10),
  maxDonationAmount: integer("max_donation_amount").notNull().default(500),
  donorSelectionPolicy: text("donor_selection_policy")
    .notNull()
    .default("least_utilized"),
  iosRequiredVersion: text("ios_required_version").notNull().default("1.0.0"),
  androidRequiredVersion: text("android_required_version").notNull().default("1.0.0"),
  iosStoreUrl: text("ios_store_url"),
  androidStoreUrl: text("android_store_url"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
