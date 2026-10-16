CREATE TABLE "prop_payout_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"payout_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"before" jsonb,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prop_payouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"phase_id" uuid NOT NULL,
	"fields" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"deduction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prop_payouts_deduction_id_unique" UNIQUE("deduction_id"),
	CONSTRAINT "prop_payouts_revision" CHECK ("prop_payouts"."revision">0)
);
--> statement-breakpoint
ALTER TABLE "prop_snapshots" ADD COLUMN "details" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "prop_payouts_owner_scope" ON "prop_payouts" USING btree ("id","owner_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "balance_adjustments_owner_scope" ON "account_balance_adjustments" USING btree ("id","owner_id");
--> statement-breakpoint
ALTER TABLE "prop_payout_events" ADD CONSTRAINT "prop_payout_events_payout_id_owner_id_prop_payouts_id_owner_id_fk" FOREIGN KEY ("payout_id","owner_id") REFERENCES "public"."prop_payouts"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prop_payouts" ADD CONSTRAINT "prop_payouts_phase_id_owner_id_prop_phases_id_owner_id_fk" FOREIGN KEY ("phase_id","owner_id") REFERENCES "public"."prop_phases"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prop_payouts" ADD CONSTRAINT "prop_payouts_deduction_id_owner_id_account_balance_adjustments_id_owner_id_fk" FOREIGN KEY ("deduction_id","owner_id") REFERENCES "public"."account_balance_adjustments"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prop_payout_events_revision" ON "prop_payout_events" USING btree ("payout_id","owner_id","revision");--> statement-breakpoint
CREATE INDEX "prop_payouts_phase" ON "prop_payouts" USING btree ("owner_id","phase_id");--> statement-breakpoint
