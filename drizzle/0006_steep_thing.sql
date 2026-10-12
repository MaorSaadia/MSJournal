CREATE TABLE "prop_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"phase_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prop_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"trading_account_id" uuid NOT NULL,
	"previous_id" uuid,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"baseline" numeric(18, 2),
	"history_confirmed" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"status_at" timestamp with time zone NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prop_phases_interval" CHECK ("prop_phases"."end_at" is null or "prop_phases"."end_at">"prop_phases"."start_at"),
	CONSTRAINT "prop_phases_kind" CHECK ("prop_phases"."kind" in ('Evaluation','Funded')),
	CONSTRAINT "prop_phases_status" CHECK ("prop_phases"."status" in ('Active','Passed','Failed','Paused','Closed'))
);
--> statement-breakpoint
CREATE TABLE "prop_rule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"phase_id" uuid NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"rules" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prop_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"phase_id" uuid NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"balance" numeric(18, 2) NOT NULL,
	"threshold" numeric(18, 2),
	"qualifying_days" integer,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prop_snapshots_days" CHECK ("prop_snapshots"."qualifying_days" is null or "prop_snapshots"."qualifying_days">=0)
);
--> statement-breakpoint
ALTER TABLE "trading_accounts" DROP CONSTRAINT "trading_accounts_status_check";--> statement-breakpoint
ALTER TABLE "trading_accounts" ADD COLUMN "program_name" text;--> statement-breakpoint
ALTER TABLE "trading_accounts" ADD COLUMN "start_date" date;--> statement-breakpoint
CREATE UNIQUE INDEX "prop_phases_scope" ON "prop_phases" USING btree ("id","owner_id");--> statement-breakpoint
ALTER TABLE "prop_events" ADD CONSTRAINT "prop_events_phase_id_owner_id_prop_phases_id_owner_id_fk" FOREIGN KEY ("phase_id","owner_id") REFERENCES "public"."prop_phases"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prop_phases" ADD CONSTRAINT "prop_phases_trading_account_id_owner_id_trading_accounts_id_owner_id_fk" FOREIGN KEY ("trading_account_id","owner_id") REFERENCES "public"."trading_accounts"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prop_phases" ADD CONSTRAINT "prop_phases_previous_id_owner_id_prop_phases_id_owner_id_fk" FOREIGN KEY ("previous_id","owner_id") REFERENCES "public"."prop_phases"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prop_rule_versions" ADD CONSTRAINT "prop_rule_versions_phase_id_owner_id_prop_phases_id_owner_id_fk" FOREIGN KEY ("phase_id","owner_id") REFERENCES "public"."prop_phases"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prop_snapshots" ADD CONSTRAINT "prop_snapshots_phase_id_owner_id_prop_phases_id_owner_id_fk" FOREIGN KEY ("phase_id","owner_id") REFERENCES "public"."prop_phases"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prop_events_scope_time" ON "prop_events" USING btree ("owner_id","phase_id","at");--> statement-breakpoint
CREATE INDEX "prop_phases_account_start" ON "prop_phases" USING btree ("owner_id","trading_account_id","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prop_rules_version" ON "prop_rule_versions" USING btree ("owner_id","phase_id","effective_at");--> statement-breakpoint
CREATE INDEX "prop_snapshots_scope_time" ON "prop_snapshots" USING btree ("owner_id","phase_id","as_of");--> statement-breakpoint
ALTER TABLE "trading_accounts" ADD CONSTRAINT "trading_accounts_status_check" CHECK ("trading_accounts"."status" in ('Active', 'Passed', 'Failed', 'Paused', 'Closed'));