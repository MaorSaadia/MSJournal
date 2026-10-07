CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"trading_account_id" uuid NOT NULL,
	"confirmation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"source" text DEFAULT 'Tradovate' NOT NULL,
	"source_timezone" text NOT NULL,
	"parser_version" text NOT NULL,
	"outcome" text NOT NULL,
	"total_count" integer NOT NULL,
	"added_count" integer NOT NULL,
	"duplicate_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_batches_counts" CHECK ("import_batches"."total_count" >= 0 and "import_batches"."added_count" >= 0 and "import_batches"."duplicate_count" >= 0 and "import_batches"."total_count" = "import_batches"."added_count" + "import_batches"."duplicate_count"),
	CONSTRAINT "import_batches_source" CHECK ("import_batches"."source" = 'Tradovate')
);
--> statement-breakpoint
CREATE TABLE "import_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"trading_account_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"report_type" text NOT NULL,
	"original_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"byte_count" integer NOT NULL,
	"total_count" integer NOT NULL,
	"added_count" integer NOT NULL,
	"duplicate_count" integer NOT NULL,
	"range_start" timestamp with time zone,
	"range_end" timestamp with time zone,
	CONSTRAINT "import_files_type" CHECK ("import_files"."report_type" in ('orders','performance')),
	CONSTRAINT "import_files_counts" CHECK ("import_files"."total_count" = "import_files"."added_count" + "import_files"."duplicate_count" and "import_files"."added_count" >= 0 and "import_files"."duplicate_count" >= 0 and "import_files"."byte_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "import_provenance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"trading_account_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"source_row" integer NOT NULL,
	"order_record_id" uuid,
	"performance_record_id" uuid,
	"raw_values" jsonb NOT NULL,
	CONSTRAINT "import_provenance_record" CHECK (("import_provenance"."order_record_id" is null) <> ("import_provenance"."performance_record_id" is null)),
	CONSTRAINT "import_provenance_row" CHECK ("import_provenance"."source_row" >= 2)
);
--> statement-breakpoint
CREATE TABLE "tradovate_order_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"trading_account_id" uuid NOT NULL,
	"order_id" text NOT NULL,
	"version_id" text NOT NULL,
	"command_id" text NOT NULL,
	"broker_account" text NOT NULL,
	"fingerprint" text NOT NULL,
	"source_timezone" text NOT NULL,
	"raw_values" jsonb NOT NULL,
	"symbol" text NOT NULL,
	"product" text NOT NULL,
	"side" text NOT NULL,
	"status" text NOT NULL,
	"order_type" text NOT NULL,
	"quantity" numeric(28, 8) NOT NULL,
	"filled_quantity" numeric(28, 8),
	"average_price" numeric(28, 8),
	"limit_price" numeric(28, 8),
	"stop_price" numeric(28, 8),
	"notional_value" numeric(28, 8),
	"currency" text NOT NULL,
	"source_timestamp" timestamp with time zone NOT NULL,
	"fill_time" timestamp with time zone,
	CONSTRAINT "tradovate_orders_quantity" CHECK ("tradovate_order_records"."quantity" > 0 and ("tradovate_order_records"."filled_quantity" is null or ("tradovate_order_records"."filled_quantity" >= 0 and "tradovate_order_records"."filled_quantity" <= "tradovate_order_records"."quantity")))
);
--> statement-breakpoint
CREATE TABLE "tradovate_performance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"trading_account_id" uuid NOT NULL,
	"identity" text NOT NULL,
	"buy_fill_id" text NOT NULL,
	"sell_fill_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"occurrence" integer NOT NULL,
	"source_timezone" text NOT NULL,
	"raw_values" jsonb NOT NULL,
	"symbol" text NOT NULL,
	"quantity" numeric(28, 8) NOT NULL,
	"buy_price" numeric(28, 8) NOT NULL,
	"sell_price" numeric(28, 8) NOT NULL,
	"gross_pnl" numeric(28, 8) NOT NULL,
	"bought_at" timestamp with time zone NOT NULL,
	"sold_at" timestamp with time zone NOT NULL,
	"duration" text NOT NULL,
	CONSTRAINT "tradovate_performance_quantity" CHECK ("tradovate_performance_records"."quantity" > 0 and "tradovate_performance_records"."occurrence" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "import_batches_id_scope_unique" ON "import_batches" USING btree ("id","owner_id","trading_account_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "import_batches_confirmation_unique" ON "import_batches" USING btree ("owner_id","confirmation_id");
--> statement-breakpoint
CREATE INDEX "import_batches_owner_time_idx" ON "import_batches" USING btree ("owner_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "import_files_id_scope_unique" ON "import_files" USING btree ("id","owner_id","trading_account_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "import_files_batch_type_unique" ON "import_files" USING btree ("batch_id","report_type");
--> statement-breakpoint
CREATE INDEX "import_files_hash_idx" ON "import_files" USING btree ("owner_id","trading_account_id","report_type","file_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "import_provenance_file_row_unique" ON "import_provenance" USING btree ("file_id","source_row");
--> statement-breakpoint
CREATE UNIQUE INDEX "tradovate_orders_identity_unique" ON "tradovate_order_records" USING btree ("owner_id","trading_account_id","order_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tradovate_orders_id_scope_unique" ON "tradovate_order_records" USING btree ("id","owner_id","trading_account_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tradovate_performance_identity_unique" ON "tradovate_performance_records" USING btree ("owner_id","trading_account_id","identity","fingerprint","occurrence");
--> statement-breakpoint
CREATE UNIQUE INDEX "tradovate_performance_id_scope_unique" ON "tradovate_performance_records" USING btree ("id","owner_id","trading_account_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "trading_accounts_id_owner_unique" ON "trading_accounts" USING btree ("id","owner_id");
--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_trading_account_id_owner_id_trading_accounts_id_owner_id_fk" FOREIGN KEY ("trading_account_id","owner_id") REFERENCES "public"."trading_accounts"("id","owner_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_files" ADD CONSTRAINT "import_files_batch_id_owner_id_trading_account_id_import_batches_id_owner_id_trading_account_id_fk" FOREIGN KEY ("batch_id","owner_id","trading_account_id") REFERENCES "public"."import_batches"("id","owner_id","trading_account_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_provenance" ADD CONSTRAINT "import_provenance_file_id_owner_id_trading_account_id_import_files_id_owner_id_trading_account_id_fk" FOREIGN KEY ("file_id","owner_id","trading_account_id") REFERENCES "public"."import_files"("id","owner_id","trading_account_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_provenance" ADD CONSTRAINT "import_provenance_order_record_id_owner_id_trading_account_id_tradovate_order_records_id_owner_id_trading_account_id_fk" FOREIGN KEY ("order_record_id","owner_id","trading_account_id") REFERENCES "public"."tradovate_order_records"("id","owner_id","trading_account_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_provenance" ADD CONSTRAINT "import_provenance_performance_record_id_owner_id_trading_account_id_tradovate_performance_records_id_owner_id_trading_account_id_fk" FOREIGN KEY ("performance_record_id","owner_id","trading_account_id") REFERENCES "public"."tradovate_performance_records"("id","owner_id","trading_account_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tradovate_order_records" ADD CONSTRAINT "tradovate_order_records_trading_account_id_owner_id_trading_accounts_id_owner_id_fk" FOREIGN KEY ("trading_account_id","owner_id") REFERENCES "public"."trading_accounts"("id","owner_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tradovate_performance_records" ADD CONSTRAINT "tradovate_performance_records_trading_account_id_owner_id_trading_accounts_id_owner_id_fk" FOREIGN KEY ("trading_account_id","owner_id") REFERENCES "public"."trading_accounts"("id","owner_id") ON DELETE restrict ON UPDATE no action;
