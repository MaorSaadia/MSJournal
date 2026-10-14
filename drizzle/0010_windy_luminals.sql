CREATE TABLE "goal_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"goal_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"state" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_checkins_state" CHECK ("goal_checkins"."state" in ('done','not-done','not-assessed')),
	CONSTRAINT "goal_checkins_revision" CHECK ("goal_checkins"."revision" > 0),
	CONSTRAINT "goal_checkins_note" CHECK (length("goal_checkins"."note") <= 500)
);
--> statement-breakpoint
CREATE TABLE "process_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"target" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"timezone" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "process_goals_type" CHECK ("process_goals"."type" in ('preparation','daily-review','trade-review','habit')),
	CONSTRAINT "process_goals_target" CHECK ("process_goals"."target" between 1 and 100000),
	CONSTRAINT "process_goals_window" CHECK ("process_goals"."end_date" >= "process_goals"."start_date" and "process_goals"."end_date" - "process_goals"."start_date" < 366),
	CONSTRAINT "process_goals_revision" CHECK ("process_goals"."revision" > 0),
	CONSTRAINT "process_goals_text" CHECK (length("process_goals"."name") between 1 and 100 and length("process_goals"."description") <= 500)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "process_goals_scope" ON "process_goals" USING btree ("id","owner_id");--> statement-breakpoint
ALTER TABLE "goal_checkins" ADD CONSTRAINT "goal_checkins_goal_id_owner_id_process_goals_id_owner_id_fk" FOREIGN KEY ("goal_id","owner_id") REFERENCES "public"."process_goals"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_goals" ADD CONSTRAINT "process_goals_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "goal_checkins_daily" ON "goal_checkins" USING btree ("goal_id","owner_id","entry_date");--> statement-breakpoint
CREATE INDEX "goal_checkins_owner_time" ON "goal_checkins" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "process_goals_owner_window" ON "process_goals" USING btree ("owner_id","archived","start_date","end_date");