CREATE TABLE "account_fee_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"trading_account_id" uuid NOT NULL,
	"per_side" numeric(28, 8),
	"contract_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" uuid DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_fee_settings_positive" CHECK ("account_fee_settings"."per_side" is null or "account_fee_settings"."per_side" >= 0)
);
--> statement-breakpoint
CREATE TABLE "journal_portion_fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"trading_account_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"amount" numeric(38, 8),
	"kind" text NOT NULL,
	"per_side" numeric(28, 8),
	"setting_revision" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_portion_fees_positive" CHECK ("journal_portion_fees"."amount" is null or "journal_portion_fees"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "journal_processing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"trading_account_id" uuid NOT NULL,
	"source_count" integer DEFAULT 0 NOT NULL,
	"processing_version" text NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"trading_account_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"direction" text NOT NULL,
	"status" text NOT NULL,
	"explanation" text NOT NULL,
	"entry_at" timestamp with time zone,
	"exit_at" timestamp with time zone NOT NULL,
	"closed_quantity" numeric(38, 8) NOT NULL,
	"entry_price" numeric(38, 16),
	"exit_price" numeric(38, 16),
	"gross_pnl" numeric(38, 8) NOT NULL,
	"fees" numeric(38, 8),
	"fee_kind" text NOT NULL,
	"processing_version" text NOT NULL,
	"current" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_records_quantity" CHECK ("journal_records"."closed_quantity" > 0),
	CONSTRAINT "journal_records_fees" CHECK ("journal_records"."fees" is null or "journal_records"."fees" >= 0)
);
--> statement-breakpoint
CREATE TABLE "journal_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"trading_account_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"source_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_fee_settings_account_unique" ON "account_fee_settings" USING btree ("trading_account_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "journal_portion_fees_source_unique" ON "journal_portion_fees" USING btree ("source_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "journal_processing_account_unique" ON "journal_processing" USING btree ("trading_account_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "journal_records_scope_unique" ON "journal_records" USING btree ("id","owner_id","trading_account_id");
--> statement-breakpoint
CREATE INDEX "journal_records_owner_exit_idx" ON "journal_records" USING btree ("owner_id","exit_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "journal_sources_source_unique" ON "journal_sources" USING btree ("source_id");
--> statement-breakpoint
ALTER TABLE "account_fee_settings" ADD CONSTRAINT "account_fee_settings_trading_account_id_owner_id_trading_accounts_id_owner_id_fk" FOREIGN KEY ("trading_account_id","owner_id") REFERENCES "public"."trading_accounts"("id","owner_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "journal_portion_fees" ADD CONSTRAINT "journal_portion_fees_source_id_owner_id_trading_account_id_tradovate_performance_records_id_owner_id_trading_account_id_fk" FOREIGN KEY ("source_id","owner_id","trading_account_id") REFERENCES "public"."tradovate_performance_records"("id","owner_id","trading_account_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "journal_processing" ADD CONSTRAINT "journal_processing_trading_account_id_owner_id_trading_accounts_id_owner_id_fk" FOREIGN KEY ("trading_account_id","owner_id") REFERENCES "public"."trading_accounts"("id","owner_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "journal_records" ADD CONSTRAINT "journal_records_trading_account_id_owner_id_trading_accounts_id_owner_id_fk" FOREIGN KEY ("trading_account_id","owner_id") REFERENCES "public"."trading_accounts"("id","owner_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "journal_sources" ADD CONSTRAINT "journal_sources_record_id_owner_id_trading_account_id_journal_records_id_owner_id_trading_account_id_fk" FOREIGN KEY ("record_id","owner_id","trading_account_id") REFERENCES "public"."journal_records"("id","owner_id","trading_account_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "journal_sources" ADD CONSTRAINT "journal_sources_source_id_owner_id_trading_account_id_tradovate_performance_records_id_owner_id_trading_account_id_fk" FOREIGN KEY ("source_id","owner_id","trading_account_id") REFERENCES "public"."tradovate_performance_records"("id","owner_id","trading_account_id") ON DELETE restrict ON UPDATE no action;
