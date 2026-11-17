CREATE TABLE "billing_plan_changes" (
	"checkout_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"environment" text NOT NULL,
	"from_membership_id" text NOT NULL,
	"to_plan_id" text NOT NULL,
	"to_membership_id" text,
	"state" text DEFAULT 'checkout' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "billing_change_environment" CHECK ("billing_plan_changes"."environment" in ('sandbox','live')),
	CONSTRAINT "billing_change_state" CHECK ("billing_plan_changes"."state" in ('checkout','awaiting_payment','cancel_pending','complete','failed'))
);
--> statement-breakpoint
ALTER TABLE "billing_plan_changes" ADD CONSTRAINT "billing_plan_changes_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_plan_changes" ADD CONSTRAINT "billing_plan_changes_environment_from_membership_id_billing_memberships_environment_membership_id_fk" FOREIGN KEY ("environment","from_membership_id") REFERENCES "public"."billing_memberships"("environment","membership_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_change_owner" ON "billing_plan_changes" USING btree ("owner_id","environment");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_change_pending_source" ON "billing_plan_changes" USING btree ("environment","from_membership_id") WHERE "billing_plan_changes"."state" not in ('complete','failed');