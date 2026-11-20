CREATE TABLE "contact_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"email_key" text NOT NULL,
	"network_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "contact_email_rate" ON "contact_submissions" USING btree ("email_key","created_at");--> statement-breakpoint
CREATE INDEX "contact_network_rate" ON "contact_submissions" USING btree ("network_key","created_at");--> statement-breakpoint
CREATE INDEX "contact_expiry" ON "contact_submissions" USING btree ("created_at");