CREATE TABLE "strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"fields" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"gallery_revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strategies_revision" CHECK ("strategies"."revision">0 and "strategies"."gallery_revision">0)
);
--> statement-breakpoint
CREATE TABLE "strategy_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"trading_account_id" uuid NOT NULL,
	"record_id" uuid,
	"original_record_id" uuid NOT NULL,
	"original_symbol" text NOT NULL,
	"original_source_ids" jsonb NOT NULL,
	"strategy_id" uuid NOT NULL,
	"playbook_revision" integer NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"needs_reassignment" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"strategy_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"thumbnail_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"example_type" text,
	"position" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strategy_images_limits" CHECK ("strategy_images"."bytes" between 1 and 10485760 and "strategy_images"."width" between 1 and 16000 and "strategy_images"."height" between 1 and 16000 and "strategy_images"."width"::bigint*"strategy_images"."height"<=40000000),
	CONSTRAINT "strategy_images_state" CHECK ("strategy_images"."state" in ('pending','ready','deleting')),
	CONSTRAINT "strategy_images_type" CHECK ("strategy_images"."example_type" is null or "strategy_images"."example_type" in ('Valid setup','Invalid setup','Management example'))
);
--> statement-breakpoint
CREATE TABLE "strategy_revisions" (
	"strategy_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"revision" integer NOT NULL,
	"fields" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strategy_revisions_strategy_id_owner_id_revision_pk" PRIMARY KEY("strategy_id","owner_id","revision")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "strategies_scope" ON "strategies" USING btree ("id","owner_id");--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_assignments" ADD CONSTRAINT "strategy_assignments_strategy_id_owner_id_playbook_revision_strategy_revisions_strategy_id_owner_id_revision_fk" FOREIGN KEY ("strategy_id","owner_id","playbook_revision") REFERENCES "public"."strategy_revisions"("strategy_id","owner_id","revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_assignments" ADD CONSTRAINT "strategy_assignments_record_id_owner_id_trading_account_id_journal_records_id_owner_id_trading_account_id_fk" FOREIGN KEY ("record_id","owner_id","trading_account_id") REFERENCES "public"."journal_records"("id","owner_id","trading_account_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_assignments" ADD CONSTRAINT "strategy_assignments_original_record_id_owner_id_trading_account_id_journal_records_id_owner_id_trading_account_id_fk" FOREIGN KEY ("original_record_id","owner_id","trading_account_id") REFERENCES "public"."journal_records"("id","owner_id","trading_account_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_images" ADD CONSTRAINT "strategy_images_strategy_id_owner_id_strategies_id_owner_id_fk" FOREIGN KEY ("strategy_id","owner_id") REFERENCES "public"."strategies"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_revisions" ADD CONSTRAINT "strategy_revisions_strategy_id_owner_id_strategies_id_owner_id_fk" FOREIGN KEY ("strategy_id","owner_id") REFERENCES "public"."strategies"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_assignments_record" ON "strategy_assignments" USING btree ("owner_id","record_id");--> statement-breakpoint
CREATE INDEX "strategy_assignments_recovery" ON "strategy_assignments" USING btree ("owner_id","needs_reassignment");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_images_key" ON "strategy_images" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_images_thumbnail" ON "strategy_images" USING btree ("thumbnail_key");