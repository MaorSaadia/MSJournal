CREATE TABLE "auth_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "auth_rate_limits_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "trading_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"display_name" text NOT NULL,
	"firm" text,
	"platform" text DEFAULT 'Tradovate' NOT NULL,
	"broker_identifier" text,
	"stage" text NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"nominal_size" numeric(18, 2) NOT NULL,
	"opening_balance" numeric(18, 2),
	"opening_balance_date" date,
	"currency" text DEFAULT 'USD' NOT NULL,
	"reporting_timezone" text DEFAULT 'Asia/Jerusalem' NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trading_accounts_stage_check" CHECK ("trading_accounts"."stage" in ('Evaluation', 'Funded', 'Personal')),
	CONSTRAINT "trading_accounts_status_check" CHECK ("trading_accounts"."status" in ('Active', 'Passed', 'Failed', 'Closed')),
	CONSTRAINT "trading_accounts_currency_check" CHECK ("trading_accounts"."currency" = 'USD'),
	CONSTRAINT "trading_accounts_nominal_positive" CHECK ("trading_accounts"."nominal_size" > 0),
	CONSTRAINT "trading_accounts_firm_required" CHECK ("trading_accounts"."stage" = 'Personal' or ("trading_accounts"."firm" is not null and length(trim("trading_accounts"."firm")) > 0)),
	CONSTRAINT "trading_accounts_opening_pair" CHECK (("trading_accounts"."opening_balance" is null and "trading_accounts"."opening_balance_date" is null) or ("trading_accounts"."opening_balance" is not null and "trading_accounts"."opening_balance_date" is not null)),
	CONSTRAINT "trading_accounts_identifier_trimmed" CHECK ("trading_accounts"."broker_identifier" is null or (length("trading_accounts"."broker_identifier") > 0 and "trading_accounts"."broker_identifier" = trim("trading_accounts"."broker_identifier")))
);
--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_timezone" text DEFAULT 'Asia/Jerusalem' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_currency_check" CHECK ("user_preferences"."currency" = 'USD')
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_accounts" ADD CONSTRAINT "trading_accounts_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_accounts_user_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_accounts_provider_identifier_unique" ON "auth_accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trading_accounts_owner_idx" ON "trading_accounts" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trading_accounts_owner_platform_broker_unique" ON "trading_accounts" USING btree ("owner_id","platform","broker_identifier") WHERE "trading_accounts"."broker_identifier" is not null and "trading_accounts"."broker_identifier" <> '';--> statement-breakpoint
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" USING btree ("identifier");