import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  uuid,
  numeric,
  date,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";

export const user = pgTable("auth_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const session = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("auth_sessions_user_idx").on(table.userId)],
);
// Authentication provider credentials are distinct from trading_accounts.
export const account = pgTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("auth_accounts_user_idx").on(table.userId),
    uniqueIndex("auth_accounts_provider_identifier_unique").on(
      table.providerId,
      table.accountId,
    ),
  ],
);
export const verification = pgTable(
  "auth_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("auth_verifications_identifier_idx").on(table.identifier)],
);
export const rateLimit = pgTable("auth_rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const tradingAccounts = pgTable(
  "trading_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    displayName: text("display_name").notNull(),
    firm: text("firm"),
    platform: text("platform").default("Tradovate").notNull(),
    brokerIdentifier: text("broker_identifier"),
    stage: text("stage")
      .$type<"Evaluation" | "Funded" | "Personal">()
      .notNull(),
    status: text("status")
      .$type<"Active" | "Passed" | "Failed" | "Closed">()
      .default("Active")
      .notNull(),
    nominalSize: numeric("nominal_size", { precision: 18, scale: 2 }).notNull(),
    openingBalance: numeric("opening_balance", { precision: 18, scale: 2 }),
    openingBalanceDate: date("opening_balance_date"),
    currency: text("currency").default("USD").notNull(),
    reportingTimezone: text("reporting_timezone")
      .default("Asia/Jerusalem")
      .notNull(),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("trading_accounts_owner_idx").on(table.ownerId),
    uniqueIndex("trading_accounts_owner_platform_broker_unique")
      .on(table.ownerId, table.platform, table.brokerIdentifier)
      .where(
        sql`${table.brokerIdentifier} is not null and ${table.brokerIdentifier} <> ''`,
      ),
    check(
      "trading_accounts_stage_check",
      sql`${table.stage} in ('Evaluation', 'Funded', 'Personal')`,
    ),
    check(
      "trading_accounts_status_check",
      sql`${table.status} in ('Active', 'Passed', 'Failed', 'Closed')`,
    ),
    check("trading_accounts_currency_check", sql`${table.currency} = 'USD'`),
    check("trading_accounts_nominal_positive", sql`${table.nominalSize} > 0`),
    check(
      "trading_accounts_firm_required",
      sql`${table.stage} = 'Personal' or (${table.firm} is not null and length(trim(${table.firm})) > 0)`,
    ),
    check(
      "trading_accounts_opening_pair",
      sql`(${table.openingBalance} is null and ${table.openingBalanceDate} is null) or (${table.openingBalance} is not null and ${table.openingBalanceDate} is not null)`,
    ),
    check(
      "trading_accounts_identifier_trimmed",
      sql`${table.brokerIdentifier} is null or (length(${table.brokerIdentifier}) > 0 and ${table.brokerIdentifier} = trim(${table.brokerIdentifier}))`,
    ),
  ],
);
export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    displayTimezone: text("display_timezone")
      .default("Asia/Jerusalem")
      .notNull(),
    currency: text("currency").default("USD").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("user_preferences_currency_check", sql`${table.currency} = 'USD'`),
  ],
);
