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
  jsonb,
  foreignKey,
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
      .$type<"Unknown" | "Estimated" | "Manual" | "Mixed">()
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
    kind: text("kind").$type<"Unknown" | "Estimated" | "Manual">().notNull(),
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
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("user_preferences_currency_check", sql`${table.currency} = 'USD'`),
  ],
);
