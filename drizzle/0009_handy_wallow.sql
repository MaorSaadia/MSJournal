CREATE TABLE "strategy_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"fields" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strategy_templates_revision" CHECK ("strategy_templates"."revision">0)
);
--> statement-breakpoint
ALTER TABLE "strategy_templates" ADD CONSTRAINT "strategy_templates_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "strategy_templates_owner" ON "strategy_templates" USING btree ("owner_id");