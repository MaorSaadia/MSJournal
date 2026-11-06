CREATE TABLE "worksheet_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"template_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"fields" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "worksheet_entries_revision" CHECK ("worksheet_entries"."revision" > 0),
	CONSTRAINT "worksheet_entries_status" CHECK ("worksheet_entries"."status" in ('draft','reviewed'))
);
--> statement-breakpoint
CREATE TABLE "worksheet_links" (
	"entry_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	CONSTRAINT "worksheet_links_kind" CHECK ("worksheet_links"."kind" in ('strategy','session','trade','account','progress'))
);
--> statement-breakpoint
CREATE TABLE "worksheet_revisions" (
	"entry_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"revision" integer NOT NULL,
	"fields" jsonb NOT NULL,
	"status" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "worksheet_revisions_entry_id_revision_pk" PRIMARY KEY("entry_id","revision"),
	CONSTRAINT "worksheet_revisions_status" CHECK ("worksheet_revisions"."status" in ('draft','reviewed'))
);
--> statement-breakpoint
CREATE TABLE "worksheet_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "worksheet_templates_version" CHECK ("worksheet_templates"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "worksheet_entries_scope" ON "worksheet_entries" USING btree ("id","owner_id");--> statement-breakpoint
ALTER TABLE "worksheet_entries" ADD CONSTRAINT "worksheet_entries_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksheet_entries" ADD CONSTRAINT "worksheet_entries_template_id_worksheet_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."worksheet_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksheet_links" ADD CONSTRAINT "worksheet_links_entry_id_owner_id_worksheet_entries_id_owner_id_fk" FOREIGN KEY ("entry_id","owner_id") REFERENCES "public"."worksheet_entries"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksheet_revisions" ADD CONSTRAINT "worksheet_revisions_entry_id_owner_id_worksheet_entries_id_owner_id_fk" FOREIGN KEY ("entry_id","owner_id") REFERENCES "public"."worksheet_entries"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "worksheet_entries_retry" ON "worksheet_entries" USING btree ("owner_id","client_id");--> statement-breakpoint
CREATE INDEX "worksheet_entries_owner_updated" ON "worksheet_entries" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "worksheet_links_owner_target" ON "worksheet_links" USING btree ("owner_id","kind","target_id");--> statement-breakpoint
CREATE INDEX "worksheet_revisions_owner" ON "worksheet_revisions" USING btree ("owner_id","entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "worksheet_templates_slug_version" ON "worksheet_templates" USING btree ("slug","version");