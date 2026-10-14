import type { PropRules } from "@/lib/props/validation";
import type { Playbook } from "@/lib/strategies/model";
import type { DailyFields, ObservationMeta } from "@/lib/daily/model";
import { sql } from "drizzle-orm";
import type { ReviewFields } from "@/lib/reviews/model";
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
  jsonb,
  primaryKey,
  foreignKey,
} from "drizzle-orm/pg-core";

export const feeReconciliations = pgTable("fee_reconciliations", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  tradingAccountId: uuid("trading_account_id").notNull(),
  importBatchId: uuid("import_batch_id"),
  total: numeric("total", { precision: 38, scale: 8 }).notNull(),
  gross: numeric("gross", { precision: 38, scale: 8 }).notNull(),
  start: date("start_date").notNull(),
  end: date("end_date").notNull(),
  timezone: text("timezone").notNull(),
  note: text("note").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("fee_reconciliations_scope").on(t.id, t.ownerId, t.tradingAccountId),
  index("fee_reconciliations_owner_account").on(t.ownerId, t.tradingAccountId, t.createdAt),
  foreignKey({ columns: [t.tradingAccountId, t.ownerId], foreignColumns: [tradingAccounts.id, tradingAccounts.ownerId] }).onDelete("restrict"),
  foreignKey({ columns: [t.importBatchId, t.ownerId, t.tradingAccountId], foreignColumns: [importBatches.id, importBatches.ownerId, importBatches.tradingAccountId] }).onDelete("restrict"),
  check("fee_reconciliations_total", sql`${t.total} >= 0`),
  check("fee_reconciliations_dates", sql`${t.end} >= ${t.start}`),
]);
export const feeReconciliationSources = pgTable("fee_reconciliation_sources", {
  reconciliationId: uuid("reconciliation_id").notNull(),
  ownerId: text("owner_id").notNull(),
  tradingAccountId: uuid("trading_account_id").notNull(),
  sourceId: uuid("source_id").notNull(),
  amount: numeric("amount", { precision: 38, scale: 8 }).notNull(),
  active: boolean("active").notNull().default(true),
}, (t) => [
  primaryKey({ columns: [t.reconciliationId, t.sourceId] }),
  uniqueIndex("fee_reconciliation_sources_active").on(t.sourceId).where(sql`${t.active} = true`),
  index("fee_reconciliation_sources_owner").on(t.ownerId, t.tradingAccountId),
  foreignKey({ columns: [t.reconciliationId, t.ownerId, t.tradingAccountId], foreignColumns: [feeReconciliations.id, feeReconciliations.ownerId, feeReconciliations.tradingAccountId] }).onDelete("restrict"),
  foreignKey({ columns: [t.sourceId, t.ownerId, t.tradingAccountId], foreignColumns: [tradovatePerformance.id, tradovatePerformance.ownerId, tradovatePerformance.tradingAccountId] }).onDelete("restrict"),
  check("fee_reconciliation_sources_amount", sql`${t.amount} >= 0`),
]);

export const processGoals = pgTable("process_goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  type: text("type").$type<"preparation" | "daily-review" | "trade-review" | "habit">().notNull(),
  start: date("start_date").notNull(),
  end: date("end_date").notNull(),
  target: integer("target").notNull(),
  description: text("description").notNull().default(""),
  timezone: text("timezone").notNull(),
  archived: boolean("archived").notNull().default(false),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("process_goals_scope").on(t.id, t.ownerId),
  index("process_goals_owner_window").on(t.ownerId, t.archived, t.start, t.end),
  check("process_goals_type", sql`${t.type} in ('preparation','daily-review','trade-review','habit')`),
  check("process_goals_target", sql`${t.target} between 1 and 100000`),
  check("process_goals_window", sql`${t.end} >= ${t.start} and ${t.end} - ${t.start} < 366`),
  check("process_goals_revision", sql`${t.revision} > 0`),
  check("process_goals_text", sql`length(${t.name}) between 1 and 100 and length(${t.description}) <= 500`),
]);
export const goalCheckins = pgTable("goal_checkins", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  goalId: uuid("goal_id").notNull(),
  date: date("entry_date").notNull(),
  state: text("state").$type<"done" | "not-done" | "not-assessed">().notNull(),
  note: text("note").notNull().default(""),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ columns: [t.goalId, t.ownerId], foreignColumns: [processGoals.id, processGoals.ownerId] }).onDelete("restrict"),
  uniqueIndex("goal_checkins_daily").on(t.goalId, t.ownerId, t.date),
  index("goal_checkins_owner_time").on(t.ownerId, t.updatedAt),
  check("goal_checkins_state", sql`${t.state} in ('done','not-done','not-assessed')`),
  check("goal_checkins_revision", sql`${t.revision} > 0`),
  check("goal_checkins_note", sql`length(${t.note}) <= 500`),
]);

export const strategyTemplates = pgTable(
  "strategy_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    fields: jsonb("fields").$type<Playbook>().notNull(),
    revision: integer("revision").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("strategy_templates_owner").on(t.ownerId),
    check("strategy_templates_revision", sql`${t.revision}>0`),
  ],
);

export const strategies = pgTable(
  "strategies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    fields: jsonb("fields").$type<Playbook>().notNull(),
    revision: integer("revision").notNull().default(1),
    galleryRevision: integer("gallery_revision").notNull().default(1),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("strategies_scope").on(t.id, t.ownerId),
    check(
      "strategies_revision",
      sql`${t.revision}>0 and ${t.galleryRevision}>0`,
    ),
  ],
);
export const strategyRevisions = pgTable(
  "strategy_revisions",
  {
    strategyId: uuid("strategy_id").notNull(),
    ownerId: text("owner_id").notNull(),
    revision: integer("revision").notNull(),
    fields: jsonb("fields").$type<Playbook>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.strategyId, t.ownerId, t.revision] }),
    foreignKey({
      columns: [t.strategyId, t.ownerId],
      foreignColumns: [strategies.id, strategies.ownerId],
    }).onDelete("restrict"),
  ],
);
export const strategyAssignments = pgTable(
  "strategy_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    tradingAccountId: uuid("trading_account_id").notNull(),
    recordId: uuid("record_id"),
    originalRecordId: uuid("original_record_id").notNull(),
    originalSymbol: text("original_symbol").notNull(),
    sourceIds: jsonb("original_source_ids").$type<string[]>().notNull(),
    strategyId: uuid("strategy_id").notNull(),
    playbookRevision: integer("playbook_revision").notNull(),
    answers: jsonb("answers")
      .$type<Record<string, "Met" | "Not met" | "Not assessed">>()
      .notNull()
      .default({}),
    revision: integer("revision").notNull().default(1),
    needsReassignment: boolean("needs_reassignment").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("strategy_assignments_record").on(t.ownerId, t.recordId),
    index("strategy_assignments_recovery").on(t.ownerId, t.needsReassignment),
    foreignKey({
      columns: [t.strategyId, t.ownerId, t.playbookRevision],
      foreignColumns: [
        strategyRevisions.strategyId,
        strategyRevisions.ownerId,
        strategyRevisions.revision,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.recordId, t.ownerId, t.tradingAccountId],
      foreignColumns: [
        journalRecords.id,
        journalRecords.ownerId,
        journalRecords.tradingAccountId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.originalRecordId, t.ownerId, t.tradingAccountId],
      foreignColumns: [
        journalRecords.id,
        journalRecords.ownerId,
        journalRecords.tradingAccountId,
      ],
    }).onDelete("restrict"),
  ],
);
export const strategyImages = pgTable(
  "strategy_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    strategyId: uuid("strategy_id").notNull(),
    objectKey: text("object_key").notNull(),
    thumbnailKey: text("thumbnail_key").notNull(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    caption: text("caption").notNull().default(""),
    stage: text("example_type").$type<
      "Valid setup" | "Invalid setup" | "Management example" | null
    >(),
    position: integer("position").notNull(),
    revision: integer("revision").notNull().default(1),
    state: text("state")
      .$type<"pending" | "ready" | "deleting">()
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.strategyId, t.ownerId],
      foreignColumns: [strategies.id, strategies.ownerId],
    }).onDelete("restrict"),
    uniqueIndex("strategy_images_key").on(t.objectKey),
    uniqueIndex("strategy_images_thumbnail").on(t.thumbnailKey),
    check(
      "strategy_images_limits",
      sql`${t.bytes} between 1 and 10485760 and ${t.width} between 1 and 16000 and ${t.height} between 1 and 16000 and ${t.width}::bigint*${t.height}<=40000000`,
    ),
    check(
      "strategy_images_state",
      sql`${t.state} in ('pending','ready','deleting')`,
    ),
    check(
      "strategy_images_type",
      sql`${t.stage} is null or ${t.stage} in ('Valid setup','Invalid setup','Management example')`,
    ),
  ],
);

export const dailyEntries = pgTable(
  "daily_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    entryDate: date("entry_date").notNull(),
    timezone: text("timezone").notNull(),
    revision: integer("revision").notNull().default(1),
    status: text("status")
      .$type<"draft" | "reviewed">()
      .notNull()
      .default("draft"),
    fields: jsonb("fields").$type<DailyFields>().notNull(),
    observationMeta: jsonb("observation_meta")
      .$type<Record<string, ObservationMeta>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("daily_entries_owner_date").on(t.ownerId, t.entryDate),
    check("daily_entries_status", sql`${t.status} in ('draft','reviewed')`),
    check("daily_entries_revision", sql`${t.revision}>0`),
  ],
);
export const dailyTemplates = pgTable("daily_templates", {
  ownerId: text("owner_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "restrict" }),
  revision: integer("revision").notNull().default(1),
  items: jsonb("items").$type<DailyFields["checklist"]>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const reviewTags = pgTable(
  "review_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [
    uniqueIndex("review_tags_owner_name").on(t.ownerId, sql`lower(${t.name})`),
    uniqueIndex("review_tags_scope").on(t.id, t.ownerId),
    check("review_tags_name_length", sql`length(${t.name}) between 1 and 60`),
  ],
);
export const journalReviews = pgTable(
  "journal_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    tradingAccountId: uuid("trading_account_id").notNull(),
    recordId: uuid("record_id"),
    originalRecordId: uuid("original_record_id").notNull(),
    originalSymbol: text("original_symbol").notNull(),
    originalSourceIds: uuid("original_source_ids").array().notNull(),
    fields: jsonb("fields").$type<ReviewFields>().notNull(),
    status: text("status")
      .$type<"draft" | "reviewed">()
      .notNull()
      .default("draft"),
    hasContent: boolean("has_content").notNull().default(false),
    hasNotes: boolean("has_notes").notNull().default(false),
    needsReassignment: boolean("needs_reassignment").notNull().default(false),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tradingAccountId, t.ownerId],
      foreignColumns: [tradingAccounts.id, tradingAccounts.ownerId],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.recordId, t.ownerId, t.tradingAccountId],
      foreignColumns: [
        journalRecords.id,
        journalRecords.ownerId,
        journalRecords.tradingAccountId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.originalRecordId, t.ownerId, t.tradingAccountId],
      foreignColumns: [
        journalRecords.id,
        journalRecords.ownerId,
        journalRecords.tradingAccountId,
      ],
    }).onDelete("restrict"),
    uniqueIndex("journal_reviews_record").on(t.ownerId, t.recordId),
    uniqueIndex("journal_reviews_scope").on(
      t.id,
      t.ownerId,
      t.tradingAccountId,
    ),
    index("journal_reviews_owner_recovery").on(t.ownerId, t.needsReassignment),
    check("journal_reviews_status", sql`${t.status} in ('draft','reviewed')`),
    check("journal_reviews_revision", sql`${t.revision}>0`),
  ],
);
export const reviewSources = pgTable(
  "review_sources",
  {
    reviewId: uuid("review_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    ownerId: text("owner_id").notNull(),
    tradingAccountId: uuid("trading_account_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.reviewId, t.sourceId] }),
    foreignKey({
      columns: [t.reviewId, t.ownerId, t.tradingAccountId],
      foreignColumns: [
        journalReviews.id,
        journalReviews.ownerId,
        journalReviews.tradingAccountId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.sourceId, t.ownerId, t.tradingAccountId],
      foreignColumns: [
        tradovatePerformance.id,
        tradovatePerformance.ownerId,
        tradovatePerformance.tradingAccountId,
      ],
    }).onDelete("restrict"),
  ],
);
export const reviewAttachments = pgTable(
  "review_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id").notNull(),
    ownerId: text("owner_id").notNull(),
    tradingAccountId: uuid("trading_account_id").notNull(),
    objectKey: text("object_key").notNull(),
    thumbnailKey: text("thumbnail_key").notNull(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    caption: text("caption").notNull().default(""),
    stage: text("stage").$type<"before" | "during" | "after" | null>(),
    position: integer("position").notNull().default(0),
    revision: integer("revision").notNull().default(1),
    state: text("state")
      .$type<"pending" | "ready" | "deleting">()
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.reviewId, t.ownerId, t.tradingAccountId],
      foreignColumns: [
        journalReviews.id,
        journalReviews.ownerId,
        journalReviews.tradingAccountId,
      ],
    }).onDelete("restrict"),
    uniqueIndex("review_attachments_object").on(t.objectKey),
    uniqueIndex("review_attachments_thumbnail").on(t.thumbnailKey),
    index("review_attachments_review").on(t.ownerId, t.reviewId),
    check(
      "review_attachments_limits",
      sql`${t.bytes}>0 and ${t.bytes}<=10485760 and ${t.width} between 1 and 16000 and ${t.height} between 1 and 16000 and ${t.width}::bigint*${t.height}<=40000000`,
    ),
    check(
      "review_attachments_state",
      sql`${t.state} in ('pending','ready','deleting')`,
    ),
    check(
      "review_attachments_stage",
      sql`${t.stage} is null or ${t.stage} in ('before','during','after')`,
    ),
  ],
);

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
    programName: text("program_name"),
    startDate: date("start_date"),
    firm: text("firm"),
    platform: text("platform").default("Tradovate").notNull(),
    brokerIdentifier: text("broker_identifier"),
    stage: text("stage")
      .$type<"Evaluation" | "Funded" | "Personal">()
      .notNull(),
    status: text("status")
      .$type<"Active" | "Passed" | "Failed" | "Paused" | "Closed">()
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
    uniqueIndex("trading_accounts_id_owner_unique").on(table.id, table.ownerId),
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
      sql`${table.status} in ('Active', 'Passed', 'Failed', 'Paused', 'Closed')`,
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
// Cash movements affect journal balance estimates, never trading P&L.
export const balanceAdjustments = pgTable(
  "account_balance_adjustments",
  {
    id: uuid("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    tradingAccountId: uuid("trading_account_id").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    kind: text("kind").$type<"deposit" | "withdrawal" | "other">().notNull(),
    explanation: text("explanation").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tradingAccountId, t.ownerId],
      foreignColumns: [tradingAccounts.id, tradingAccounts.ownerId],
    }).onDelete("restrict"),
    index("account_balance_adjustments_scope_time_idx").on(
      t.ownerId,
      t.tradingAccountId,
      t.effectiveAt,
    ),
    check(
      "account_balance_adjustments_kind",
      sql`${t.kind} in ('deposit','withdrawal','other')`,
    ),
    check(
      "account_balance_adjustments_sign",
      sql`(${t.kind}='deposit' and ${t.amount}>0) or (${t.kind}='withdrawal' and ${t.amount}<0) or (${t.kind}='other' and ${t.amount}<>0 and length(trim(${t.explanation}))>0)`,
    ),
  ],
);
// Imported source records are deliberately separate from reconstructed journal trades.
const sourceScope = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  tradingAccountId: uuid("trading_account_id").notNull(),
});
// Derived data can be replaced atomically; source imports remain immutable.
export const journalRecords = pgTable(
  "journal_records",
  {
    ...sourceScope(),
    symbol: text("symbol").notNull(),
    direction: text("direction")
      .$type<"long" | "short" | "unknown">()
      .notNull(),
    status: text("status")
      .$type<"Matched portions" | "Needs review">()
      .notNull(),
    explanation: text("explanation").notNull(),
    entryAt: timestamp("entry_at", { withTimezone: true }),
    exitAt: timestamp("exit_at", { withTimezone: true }).notNull(),
    closedQuantity: numeric("closed_quantity", {
      precision: 38,
      scale: 8,
    }).notNull(),
    entryPrice: numeric("entry_price", { precision: 38, scale: 16 }),
    exitPrice: numeric("exit_price", { precision: 38, scale: 16 }),
    grossPnl: numeric("gross_pnl", { precision: 38, scale: 8 }).notNull(),
    fees: numeric("fees", { precision: 38, scale: 8 }),
    feeKind: text("fee_kind")
      .$type<"Unknown" | "Estimated" | "Manual" | "Allocated" | "Mixed">()
      .notNull(),
    version: text("processing_version").notNull(),
    current: boolean("current").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tradingAccountId, t.ownerId],
      foreignColumns: [tradingAccounts.id, tradingAccounts.ownerId],
    }).onDelete("restrict"),
    uniqueIndex("journal_records_scope_unique").on(
      t.id,
      t.ownerId,
      t.tradingAccountId,
    ),
    index("journal_records_owner_exit_idx").on(t.ownerId, t.exitAt),
    check("journal_records_quantity", sql`${t.closedQuantity} > 0`),
    check("journal_records_fees", sql`${t.fees} is null or ${t.fees} >= 0`),
  ],
);
export const journalSources = pgTable(
  "journal_sources",
  {
    ...sourceScope(),
    recordId: uuid("record_id").notNull(),
    sourceId: uuid("source_id").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.recordId, t.ownerId, t.tradingAccountId],
      foreignColumns: [
        journalRecords.id,
        journalRecords.ownerId,
        journalRecords.tradingAccountId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.sourceId, t.ownerId, t.tradingAccountId],
      foreignColumns: [
        tradovatePerformance.id,
        tradovatePerformance.ownerId,
        tradovatePerformance.tradingAccountId,
      ],
    }).onDelete("restrict"),
    uniqueIndex("journal_sources_source_unique").on(t.sourceId),
  ],
);
export const accountFeeSettings = pgTable(
  "account_fee_settings",
  {
    ...sourceScope(),
    perSide: numeric("per_side", { precision: 28, scale: 8 }),
    contractOverrides: jsonb("contract_overrides")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    revision: uuid("revision").notNull().defaultRandom(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tradingAccountId, t.ownerId],
      foreignColumns: [tradingAccounts.id, tradingAccounts.ownerId],
    }).onDelete("restrict"),
    uniqueIndex("account_fee_settings_account_unique").on(t.tradingAccountId),
    check(
      "account_fee_settings_positive",
      sql`${t.perSide} is null or ${t.perSide} >= 0`,
    ),
  ],
);
// Fees belong to immutable portions, so regrouping cannot discard a manual adjustment.
export const journalPortionFees = pgTable(
  "journal_portion_fees",
  {
    ...sourceScope(),
    sourceId: uuid("source_id").notNull(),
    amount: numeric("amount", { precision: 38, scale: 8 }),
    kind: text("kind").$type<"Unknown" | "Estimated" | "Manual" | "Allocated">().notNull(),
    perSide: numeric("per_side", { precision: 28, scale: 8 }),
    settingRevision: uuid("setting_revision"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.sourceId, t.ownerId, t.tradingAccountId],
      foreignColumns: [
        tradovatePerformance.id,
        tradovatePerformance.ownerId,
        tradovatePerformance.tradingAccountId,
      ],
    }).onDelete("restrict"),
    uniqueIndex("journal_portion_fees_source_unique").on(t.sourceId),
    check(
      "journal_portion_fees_positive",
      sql`${t.amount} is null or ${t.amount} >= 0`,
    ),
  ],
);
export const journalProcessing = pgTable(
  "journal_processing",
  {
    ...sourceScope(),
    sourceCount: integer("source_count").notNull().default(0),
    version: text("processing_version").notNull(),
    status: text("status").$type<"Ready" | "Failed">().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tradingAccountId, t.ownerId],
      foreignColumns: [tradingAccounts.id, tradingAccounts.ownerId],
    }).onDelete("restrict"),
    uniqueIndex("journal_processing_account_unique").on(t.tradingAccountId),
  ],
);
export const importBatches = pgTable(
  "import_batches",
  {
    ...sourceScope(),
    confirmationId: uuid("confirmation_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    source: text("source").notNull().default("Tradovate"),
    timezone: text("source_timezone").notNull(),
    parserVersion: text("parser_version").notNull(),
    outcome: text("outcome").$type<"Imported" | "Already imported">().notNull(),
    total: integer("total_count").notNull(),
    added: integer("added_count").notNull(),
    duplicates: integer("duplicate_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tradingAccountId, t.ownerId],
      foreignColumns: [tradingAccounts.id, tradingAccounts.ownerId],
    }).onDelete("restrict"),
    uniqueIndex("import_batches_id_scope_unique").on(
      t.id,
      t.ownerId,
      t.tradingAccountId,
    ),
    uniqueIndex("import_batches_confirmation_unique").on(
      t.ownerId,
      t.confirmationId,
    ),
    index("import_batches_owner_time_idx").on(t.ownerId, t.createdAt),
    check(
      "import_batches_counts",
      sql`${t.total} >= 0 and ${t.added} >= 0 and ${t.duplicates} >= 0 and ${t.total} = ${t.added} + ${t.duplicates}`,
    ),
    check("import_batches_source", sql`${t.source} = 'Tradovate'`),
  ],
);
export const importFiles = pgTable(
  "import_files",
  {
    ...sourceScope(),
    batchId: uuid("batch_id").notNull(),
    reportType: text("report_type").$type<"orders" | "performance">().notNull(),
    originalName: text("original_name").notNull(),
    fileHash: text("file_hash").notNull(),
    bytes: integer("byte_count").notNull(),
    total: integer("total_count").notNull(),
    added: integer("added_count").notNull(),
    duplicates: integer("duplicate_count").notNull(),
    start: timestamp("range_start", { withTimezone: true }),
    end: timestamp("range_end", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      columns: [t.batchId, t.ownerId, t.tradingAccountId],
      foreignColumns: [
        importBatches.id,
        importBatches.ownerId,
        importBatches.tradingAccountId,
      ],
    }).onDelete("restrict"),
    uniqueIndex("import_files_id_scope_unique").on(
      t.id,
      t.ownerId,
      t.tradingAccountId,
    ),
    uniqueIndex("import_files_batch_type_unique").on(t.batchId, t.reportType),
    index("import_files_hash_idx").on(
      t.ownerId,
      t.tradingAccountId,
      t.reportType,
      t.fileHash,
    ),
    check(
      "import_files_type",
      sql`${t.reportType} in ('orders','performance')`,
    ),
    check(
      "import_files_counts",
      sql`${t.total} = ${t.added} + ${t.duplicates} and ${t.added} >= 0 and ${t.duplicates} >= 0 and ${t.bytes} > 0`,
    ),
  ],
);
export const tradovateOrders = pgTable(
  "tradovate_order_records",
  {
    ...sourceScope(),
    orderId: text("order_id").notNull(),
    versionId: text("version_id").notNull(),
    commandId: text("command_id").notNull(),
    brokerAccount: text("broker_account").notNull(),
    fingerprint: text("fingerprint").notNull(),
    sourceTimezone: text("source_timezone").notNull(),
    raw: jsonb("raw_values").$type<Record<string, string>>().notNull(),
    symbol: text("symbol").notNull(),
    product: text("product").notNull(),
    side: text("side").notNull(),
    status: text("status").notNull(),
    orderType: text("order_type").notNull(),
    quantity: numeric("quantity", { precision: 28, scale: 8 }).notNull(),
    filledQuantity: numeric("filled_quantity", { precision: 28, scale: 8 }),
    averagePrice: numeric("average_price", { precision: 28, scale: 8 }),
    limitPrice: numeric("limit_price", { precision: 28, scale: 8 }),
    stopPrice: numeric("stop_price", { precision: 28, scale: 8 }),
    notionalValue: numeric("notional_value", { precision: 28, scale: 8 }),
    currency: text("currency").notNull(),
    timestamp: timestamp("source_timestamp", { withTimezone: true }).notNull(),
    fillTime: timestamp("fill_time", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      columns: [t.tradingAccountId, t.ownerId],
      foreignColumns: [tradingAccounts.id, tradingAccounts.ownerId],
    }).onDelete("restrict"),
    uniqueIndex("tradovate_orders_identity_unique").on(
      t.ownerId,
      t.tradingAccountId,
      t.orderId,
    ),
    uniqueIndex("tradovate_orders_id_scope_unique").on(
      t.id,
      t.ownerId,
      t.tradingAccountId,
    ),
    check(
      "tradovate_orders_quantity",
      sql`${t.quantity} > 0 and (${t.filledQuantity} is null or (${t.filledQuantity} >= 0 and ${t.filledQuantity} <= ${t.quantity}))`,
    ),
  ],
);
export const tradovatePerformance = pgTable(
  "tradovate_performance_records",
  {
    ...sourceScope(),
    identity: text("identity").notNull(),
    buyFillId: text("buy_fill_id").notNull(),
    sellFillId: text("sell_fill_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    occurrence: integer("occurrence").notNull(),
    sourceTimezone: text("source_timezone").notNull(),
    raw: jsonb("raw_values").$type<Record<string, string>>().notNull(),
    symbol: text("symbol").notNull(),
    quantity: numeric("quantity", { precision: 28, scale: 8 }).notNull(),
    buyPrice: numeric("buy_price", { precision: 28, scale: 8 }).notNull(),
    sellPrice: numeric("sell_price", { precision: 28, scale: 8 }).notNull(),
    grossPnl: numeric("gross_pnl", { precision: 28, scale: 8 }).notNull(),
    boughtAt: timestamp("bought_at", { withTimezone: true }).notNull(),
    soldAt: timestamp("sold_at", { withTimezone: true }).notNull(),
    duration: text("duration").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tradingAccountId, t.ownerId],
      foreignColumns: [tradingAccounts.id, tradingAccounts.ownerId],
    }).onDelete("restrict"),
    uniqueIndex("tradovate_performance_identity_unique").on(
      t.ownerId,
      t.tradingAccountId,
      t.identity,
      t.fingerprint,
      t.occurrence,
    ),
    uniqueIndex("tradovate_performance_id_scope_unique").on(
      t.id,
      t.ownerId,
      t.tradingAccountId,
    ),
    index("performance_calendar_exit_idx").on(
      t.ownerId,
      t.tradingAccountId,
      sql`greatest(${t.boughtAt}, ${t.soldAt})`,
    ),
    check(
      "tradovate_performance_quantity",
      sql`${t.quantity} > 0 and ${t.occurrence} > 0`,
    ),
  ],
);
export const importProvenance = pgTable(
  "import_provenance",
  {
    ...sourceScope(),
    fileId: uuid("file_id").notNull(),
    sourceRow: integer("source_row").notNull(),
    orderRecordId: uuid("order_record_id"),
    performanceRecordId: uuid("performance_record_id"),
    raw: jsonb("raw_values").$type<Record<string, string>>().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.fileId, t.ownerId, t.tradingAccountId],
      foreignColumns: [
        importFiles.id,
        importFiles.ownerId,
        importFiles.tradingAccountId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.orderRecordId, t.ownerId, t.tradingAccountId],
      foreignColumns: [
        tradovateOrders.id,
        tradovateOrders.ownerId,
        tradovateOrders.tradingAccountId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.performanceRecordId, t.ownerId, t.tradingAccountId],
      foreignColumns: [
        tradovatePerformance.id,
        tradovatePerformance.ownerId,
        tradovatePerformance.tradingAccountId,
      ],
    }).onDelete("restrict"),
    uniqueIndex("import_provenance_file_row_unique").on(t.fileId, t.sourceRow),
    check(
      "import_provenance_record",
      sql`(${t.orderRecordId} is null) <> (${t.performanceRecordId} is null)`,
    ),
    check("import_provenance_row", sql`${t.sourceRow} >= 2`),
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
    weekStartsOn: integer("week_starts_on").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("user_preferences_currency_check", sql`${table.currency} = 'USD'`),
    check(
      "user_preferences_week_start_check",
      sql`${table.weekStartsOn} in (0, 1)`,
    ),
  ],
);

// Phase/rule/snapshot history is append-only; immutable source trades stay on trading_accounts.
export const propPhases = pgTable(
  "prop_phases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    tradingAccountId: uuid("trading_account_id").notNull(),
    previousId: uuid("previous_id"),
    kind: text("kind").$type<"Evaluation" | "Funded">().notNull(),
    label: text("label").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }),
    baseline: numeric("baseline", { precision: 18, scale: 2 }),
    historyConfirmed: boolean("history_confirmed").notNull().default(false),
    status: text("status").notNull().default("Active"),
    statusAt: timestamp("status_at", { withTimezone: true }).notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("prop_phases_scope").on(t.id, t.ownerId),
    foreignKey({
      columns: [t.tradingAccountId, t.ownerId],
      foreignColumns: [tradingAccounts.id, tradingAccounts.ownerId],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.previousId, t.ownerId],
      foreignColumns: [t.id, t.ownerId],
    }).onDelete("restrict"),
    index("prop_phases_account_start").on(
      t.ownerId,
      t.tradingAccountId,
      t.startAt,
    ),
    check(
      "prop_phases_interval",
      sql`${t.endAt} is null or ${t.endAt}>${t.startAt}`,
    ),
    check("prop_phases_kind", sql`${t.kind} in ('Evaluation','Funded')`),
    check(
      "prop_phases_status",
      sql`${t.status} in ('Active','Passed','Failed','Paused','Closed')`,
    ),
  ],
);
export const propRuleVersions = pgTable(
  "prop_rule_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    phaseId: uuid("phase_id").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    rules: jsonb("rules").$type<PropRules>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.phaseId, t.ownerId],
      foreignColumns: [propPhases.id, propPhases.ownerId],
    }).onDelete("restrict"),
    uniqueIndex("prop_rules_version").on(t.ownerId, t.phaseId, t.effectiveAt),
  ],
);
export const propSnapshots = pgTable(
  "prop_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    phaseId: uuid("phase_id").notNull(),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    balance: numeric("balance", { precision: 18, scale: 2 }).notNull(),
    threshold: numeric("threshold", { precision: 18, scale: 2 }),
    qualifyingDays: integer("qualifying_days"),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.phaseId, t.ownerId],
      foreignColumns: [propPhases.id, propPhases.ownerId],
    }).onDelete("restrict"),
    index("prop_snapshots_scope_time").on(t.ownerId, t.phaseId, t.asOf),
    check(
      "prop_snapshots_days",
      sql`${t.qualifyingDays} is null or ${t.qualifyingDays}>=0`,
    ),
  ],
);
export const propEvents = pgTable(
  "prop_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    phaseId: uuid("phase_id").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    kind: text("kind").notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.phaseId, t.ownerId],
      foreignColumns: [propPhases.id, propPhases.ownerId],
    }).onDelete("restrict"),
    index("prop_events_scope_time").on(t.ownerId, t.phaseId, t.at),
  ],
);
