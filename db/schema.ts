import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  decimal,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Users table - syncs with Supabase Auth
export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // Matches Supabase auth.users id
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Donations table - tracks each donor's current weekly contribution.
export const donations = pgTable(
  "donations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id).notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date"), // null = ongoing, set = cancelled
    status: text("status").notNull().default("active"), // active, paused, cancelled
    notifyOnSpend: boolean("notify_on_spend").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("donations_user_id_unique").on(table.userId),
    check("donations_amount_positive", sql`${table.amount} > 0`),
    check(
      "donations_status_valid",
      sql`${table.status} in ('active', 'paused', 'cancelled')`
    ),
    check(
      "donations_date_window_valid",
      sql`${table.endDate} is null or ${table.endDate} >= ${table.startDate}`
    ),
  ]
);

// Weekly pools table - aggregates weekly donation amounts
export const weeklyPools = pgTable(
  "weekly_pools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weekStart: timestamp("week_start").notNull().unique(), // Start of the week
    weekEnd: timestamp("week_end").notNull(),
    totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull().default("0"), // Total points available this week
    allocatedAmount: decimal("allocated_amount", { precision: 10, scale: 2 }).notNull().default("0"), // Points already allocated
    remainingAmount: decimal("remaining_amount", { precision: 10, scale: 2 }).notNull().default("0"), // Points still available
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check("weekly_pools_window_valid", sql`${table.weekEnd} > ${table.weekStart}`),
    check(
      "weekly_pools_amounts_nonnegative",
      sql`${table.totalAmount} >= 0 and ${table.allocatedAmount} >= 0 and ${table.remainingAmount} >= 0`
    ),
    check(
      "weekly_pools_balances_within_total",
      sql`${table.allocatedAmount} <= ${table.totalAmount} and ${table.remainingAmount} <= ${table.totalAmount}`
    ),
  ]
);

// Claim codes table - generated codes for requesters
export const claimCodes = pgTable(
  "claim_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id).notNull(), // Requester who gets the code
    weeklyPoolId: uuid("weekly_pool_id").references(() => weeklyPools.id).notNull(),
    donorUserId: uuid("donor_user_id").references(() => users.id), // Donor whose GET account was used
    code: text("code").notNull().unique(), // The actual claim code from GET Tools API
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(), // Points value of this code
    status: text("status").notNull().default("pending"), // pending, active, redeemed, expired
    expiresAt: timestamp("expires_at").notNull(), // Short-lived expiry
    redeemedAt: timestamp("redeemed_at"),
    balanceSnapshot: text("balance_snapshot"), // JSON snapshot of donor account balances at generation time
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_claim_codes_donor_redeemed")
      .on(table.donorUserId, table.redeemedAt)
      .where(sql`${table.status} = 'redeemed'`),
    index("idx_claim_codes_donor_active_reservation")
      .on(table.donorUserId, table.expiresAt, table.createdAt)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex("claim_codes_active_requester_unique")
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex("claim_codes_active_donor_unique")
      .on(table.donorUserId)
      .where(sql`${table.status} = 'active'`),
    check("claim_codes_amount_positive", sql`${table.amount} > 0`),
    check(
      "claim_codes_status_valid",
      sql`${table.status} in ('pending', 'active', 'redeemed', 'expired', 'cancelled')`
    ),
    check("claim_codes_expiry_valid", sql`${table.expiresAt} > ${table.createdAt}`),
  ]
);

// Redemptions table - tracks code redemption history
export const redemptions = pgTable(
  "redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimCodeId: uuid("claim_code_id").references(() => claimCodes.id).notNull(),
    userId: uuid("user_id").references(() => users.id).notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    redeemedAt: timestamp("redeemed_at").defaultNow().notNull(),
    getToolsTransactionId: text("get_tools_transaction_id"), // Reference to GET Tools API transaction
  },
  (table) => [
    uniqueIndex("redemptions_claim_code_id_unique").on(table.claimCodeId),
    check("redemptions_amount_positive", sql`${table.amount} > 0`),
  ]
);

// User allowances table - tracks weekly allowances for requesters
export const userAllowances = pgTable(
  "user_allowances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id).notNull(),
    weeklyPoolId: uuid("weekly_pool_id").references(() => weeklyPools.id).notNull(),
    weeklyLimit: decimal("weekly_limit", { precision: 10, scale: 2 }).notNull(), // Max points per week
    usedAmount: decimal("used_amount", { precision: 10, scale: 2 }).notNull().default("0"), // Points used this week
    remainingAmount: decimal("remaining_amount", { precision: 10, scale: 2 }).notNull(), // Points left this week
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_allowances_user_weekly_pool_unique").on(
      table.userId,
      table.weeklyPoolId
    ),
    check(
      "user_allowances_amounts_nonnegative",
      sql`${table.weeklyLimit} >= 0 and ${table.usedAmount} >= 0 and ${table.remainingAmount} >= 0`
    ),
    check(
      "user_allowances_remaining_within_limit",
      sql`${table.remainingAmount} <= ${table.weeklyLimit}`
    ),
  ]
);

// GET credentials table - stores per-user device credentials for GET API access
export const getCredentials = pgTable("get_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull().unique(),
  deviceId: text("device_id").notNull(),
  encryptedPin: text("encrypted_pin").notNull(),
  linkedAt: timestamp("linked_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Admin config table - persistent global settings
export const adminConfig = pgTable(
  "admin_config",
  {
    id: text("id").primaryKey().default("global"),
    defaultWeeklyAllowance: integer("default_weekly_allowance").notNull().default(50),
    defaultClaimAmount: integer("default_claim_amount").notNull().default(10),
    codeExpiryMinutes: integer("code_expiry_minutes").notNull().default(5),
    poolCalculationMethod: text("pool_calculation_method").notNull().default("equal"),
    maxClaimsPerDay: integer("max_claims_per_day").notNull().default(5),
    minDonationAmount: integer("min_donation_amount").notNull().default(10),
    maxDonationAmount: integer("max_donation_amount").notNull().default(500),
    donorSelectionPolicy: text("donor_selection_policy").notNull().default("least_utilized"),
    iosRequiredVersion: text("ios_required_version").notNull().default("1.0.0"),
    androidRequiredVersion: text("android_required_version").notNull().default("1.0.0"),
    iosStoreUrl: text("ios_store_url"),
    androidStoreUrl: text("android_store_url"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "admin_config_positive_values",
      sql`${table.defaultWeeklyAllowance} > 0 and ${table.defaultClaimAmount} > 0 and ${table.codeExpiryMinutes} > 0 and ${table.maxClaimsPerDay} > 0 and ${table.minDonationAmount} > 0 and ${table.maxDonationAmount} > 0`
    ),
    check(
      "admin_config_donation_range_valid",
      sql`${table.minDonationAmount} <= ${table.maxDonationAmount}`
    ),
    check(
      "admin_config_claim_within_allowance",
      sql`${table.defaultClaimAmount} <= ${table.defaultWeeklyAllowance}`
    ),
    check(
      "admin_config_pool_method_valid",
      sql`${table.poolCalculationMethod} in ('equal', 'proportional')`
    ),
    check(
      "admin_config_donor_policy_valid",
      sql`${table.donorSelectionPolicy} in ('round_robin', 'weighted_round_robin', 'least_utilized', 'highest_balance')`
    ),
  ]
);
