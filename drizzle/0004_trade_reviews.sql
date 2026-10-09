CREATE TABLE "journal_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"trading_account_id" uuid NOT NULL,
	"record_id" uuid,
	"original_record_id" uuid NOT NULL,
	"original_symbol" text NOT NULL,
	"original_source_ids" uuid[] NOT NULL,
	"fields" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"has_content" boolean DEFAULT false NOT NULL,
	"has_notes" boolean DEFAULT false NOT NULL,
	"needs_reassignment" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_reviews_status" CHECK ("journal_reviews"."status" in ('draft','reviewed')),
	CONSTRAINT "journal_reviews_revision" CHECK ("journal_reviews"."revision">0)
);
--> statement-breakpoint
CREATE TABLE "review_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"trading_account_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"thumbnail_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"stage" text,
	"position" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_attachments_limits" CHECK ("review_attachments"."bytes">0 and "review_attachments"."bytes"<=10485760 and "review_attachments"."width" between 1 and 16000 and "review_attachments"."height" between 1 and 16000 and "review_attachments"."width"::bigint*"review_attachments"."height"<=40000000),
	CONSTRAINT "review_attachments_state" CHECK ("review_attachments"."state" in ('pending','ready','deleting')),
	CONSTRAINT "review_attachments_stage" CHECK ("review_attachments"."stage" is null or "review_attachments"."stage" in ('before','during','after'))
);
--> statement-breakpoint
CREATE TABLE "review_sources" (
	"review_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"trading_account_id" uuid NOT NULL,
	CONSTRAINT "review_sources_review_id_source_id_pk" PRIMARY KEY("review_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "review_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "review_tags_name_length" CHECK (length("review_tags"."name") between 1 and 60)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "journal_reviews_scope" ON "journal_reviews" USING btree ("id","owner_id","trading_account_id");--> statement-breakpoint
ALTER TABLE "journal_reviews" ADD CONSTRAINT "journal_reviews_trading_account_id_owner_id_trading_accounts_id_owner_id_fk" FOREIGN KEY ("trading_account_id","owner_id") REFERENCES "public"."trading_accounts"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_reviews" ADD CONSTRAINT "journal_reviews_record_id_owner_id_trading_account_id_journal_records_id_owner_id_trading_account_id_fk" FOREIGN KEY ("record_id","owner_id","trading_account_id") REFERENCES "public"."journal_records"("id","owner_id","trading_account_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_reviews" ADD CONSTRAINT "journal_reviews_original_record_id_owner_id_trading_account_id_journal_records_id_owner_id_trading_account_id_fk" FOREIGN KEY ("original_record_id","owner_id","trading_account_id") REFERENCES "public"."journal_records"("id","owner_id","trading_account_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_attachments" ADD CONSTRAINT "review_attachments_review_id_owner_id_trading_account_id_journal_reviews_id_owner_id_trading_account_id_fk" FOREIGN KEY ("review_id","owner_id","trading_account_id") REFERENCES "public"."journal_reviews"("id","owner_id","trading_account_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_sources" ADD CONSTRAINT "review_sources_review_id_owner_id_trading_account_id_journal_reviews_id_owner_id_trading_account_id_fk" FOREIGN KEY ("review_id","owner_id","trading_account_id") REFERENCES "public"."journal_reviews"("id","owner_id","trading_account_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_sources" ADD CONSTRAINT "review_sources_source_id_owner_id_trading_account_id_tradovate_performance_records_id_owner_id_trading_account_id_fk" FOREIGN KEY ("source_id","owner_id","trading_account_id") REFERENCES "public"."tradovate_performance_records"("id","owner_id","trading_account_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tags" ADD CONSTRAINT "review_tags_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_reviews_record" ON "journal_reviews" USING btree ("owner_id","record_id");--> statement-breakpoint
CREATE INDEX "journal_reviews_owner_recovery" ON "journal_reviews" USING btree ("owner_id","needs_reassignment");--> statement-breakpoint
CREATE UNIQUE INDEX "review_attachments_object" ON "review_attachments" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "review_attachments_thumbnail" ON "review_attachments" USING btree ("thumbnail_key");--> statement-breakpoint
CREATE INDEX "review_attachments_review" ON "review_attachments" USING btree ("owner_id","review_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_tags_owner_name" ON "review_tags" USING btree ("owner_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "review_tags_scope" ON "review_tags" USING btree ("id","owner_id");
