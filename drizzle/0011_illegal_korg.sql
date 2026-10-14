CREATE TABLE "fee_reconciliation_sources" (
	"reconciliation_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"trading_account_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"amount" numeric(38, 8) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "fee_reconciliation_sources_reconciliation_id_source_id_pk" PRIMARY KEY("reconciliation_id","source_id"),
	CONSTRAINT "fee_reconciliation_sources_amount" CHECK ("fee_reconciliation_sources"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fee_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"trading_account_id" uuid NOT NULL,
	"import_batch_id" uuid,
	"total" numeric(38, 8) NOT NULL,
	"gross" numeric(38, 8) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"timezone" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_reconciliations_total" CHECK ("fee_reconciliations"."total" >= 0),
	CONSTRAINT "fee_reconciliations_dates" CHECK ("fee_reconciliations"."end_date" >= "fee_reconciliations"."start_date")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "fee_reconciliations_scope" ON "fee_reconciliations" USING btree ("id","owner_id","trading_account_id");--> statement-breakpoint
ALTER TABLE "fee_reconciliation_sources" ADD CONSTRAINT "fee_reconciliation_sources_reconciliation_id_owner_id_trading_account_id_fee_reconciliations_id_owner_id_trading_account_id_fk" FOREIGN KEY ("reconciliation_id","owner_id","trading_account_id") REFERENCES "public"."fee_reconciliations"("id","owner_id","trading_account_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_reconciliation_sources" ADD CONSTRAINT "fee_reconciliation_sources_source_id_owner_id_trading_account_id_tradovate_performance_records_id_owner_id_trading_account_id_fk" FOREIGN KEY ("source_id","owner_id","trading_account_id") REFERENCES "public"."tradovate_performance_records"("id","owner_id","trading_account_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_reconciliations" ADD CONSTRAINT "fee_reconciliations_trading_account_id_owner_id_trading_accounts_id_owner_id_fk" FOREIGN KEY ("trading_account_id","owner_id") REFERENCES "public"."trading_accounts"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_reconciliations" ADD CONSTRAINT "fee_reconciliations_import_batch_id_owner_id_trading_account_id_import_batches_id_owner_id_trading_account_id_fk" FOREIGN KEY ("import_batch_id","owner_id","trading_account_id") REFERENCES "public"."import_batches"("id","owner_id","trading_account_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fee_reconciliation_sources_active" ON "fee_reconciliation_sources" USING btree ("source_id") WHERE "fee_reconciliation_sources"."active" = true;--> statement-breakpoint
CREATE INDEX "fee_reconciliation_sources_owner" ON "fee_reconciliation_sources" USING btree ("owner_id","trading_account_id");--> statement-breakpoint
CREATE INDEX "fee_reconciliations_owner_account" ON "fee_reconciliations" USING btree ("owner_id","trading_account_id","created_at");