CREATE TABLE "daily_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"entry_date" date NOT NULL,
	"timezone" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"fields" jsonb NOT NULL,
	"observation_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_entries_status" CHECK ("daily_entries"."status" in ('draft','reviewed')),
	CONSTRAINT "daily_entries_revision" CHECK ("daily_entries"."revision">0)
);
--> statement-breakpoint
CREATE TABLE "daily_templates" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"items" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_entries" ADD CONSTRAINT "daily_entries_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_templates" ADD CONSTRAINT "daily_templates_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_entries_owner_date" ON "daily_entries" USING btree ("owner_id","entry_date");