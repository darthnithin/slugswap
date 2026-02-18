import { pgTable, uuid, text, integer, timestamp, decimal } from "drizzle-orm/pg-core";

// Users table - syncs with Supabase Auth
export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // Matches Supabase auth.users id
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Donations table - tracks monthly donor contributions
export const donations = pgTable("donations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(), // Monthly contribution in dining points
  startDate: timestamp("start_date").notNull(), // When donation period starts
  endDate: timestamp("end_date"), // null = ongoing, set = cancelled
  status: text("status").notNull().default("active"), // active, paused, cancelled
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Weekly pools table - aggregates weekly donation amounts
export const weeklyPools = pgTable("weekly_pools", {
  id: uuid("id").primaryKey().defaultRandom(),
  weekStart: timestamp("week_start").notNull().unique(), // Start of the week
  weekEnd: timestamp("week_end").notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull().default("0"), // Total points available this week
  allocatedAmount: decimal("allocated_amount", { precision: 10, scale: 2 }).notNull().default("0"), // Points already allocated
  remainingAmount: decimal("remaining_amount", { precision: 10, scale: 2 }).notNull().default("0"), // Points still available
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Claim codes table - generated codes for requesters
export const claimCodes = pgTable("claim_codes", {
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
});

// Redemptions table - tracks code redemption history
export const redemptions = pgTable("redemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  claimCodeId: uuid("claim_code_id").references(() => claimCodes.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  redeemedAt: timestamp("redeemed_at").defaultNow().notNull(),
  getToolsTransactionId: text("get_tools_transaction_id"), // Reference to GET Tools API transaction
});

// User allowances table - tracks weekly allowances for requesters
export const userAllowances = pgTable("user_allowances", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  weeklyPoolId: uuid("weekly_pool_id").references(() => weeklyPools.id).notNull(),
  weeklyLimit: decimal("weekly_limit", { precision: 10, scale: 2 }).notNull(), // Max points per week
  usedAmount: decimal("used_amount", { precision: 10, scale: 2 }).notNull().default("0"), // Points used this week
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
export const adminConfig = pgTable("admin_config", {
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
});
