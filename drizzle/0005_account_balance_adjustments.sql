CREATE TABLE "account_balance_adjustments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"trading_account_id" uuid NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"kind" text NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_balance_adjustments_kind" CHECK ("account_balance_adjustments"."kind" in ('deposit','withdrawal','other')),
	CONSTRAINT "account_balance_adjustments_sign" CHECK (("account_balance_adjustments"."kind"='deposit' and "account_balance_adjustments"."amount">0) or ("account_balance_adjustments"."kind"='withdrawal' and "account_balance_adjustments"."amount"<0) or ("account_balance_adjustments"."kind"='other' and "account_balance_adjustments"."amount"<>0 and length(trim("account_balance_adjustments"."explanation"))>0))
);
--> statement-breakpoint
ALTER TABLE "account_balance_adjustments" ADD CONSTRAINT "account_balance_adjustments_trading_account_id_owner_id_trading_accounts_id_owner_id_fk" FOREIGN KEY ("trading_account_id","owner_id") REFERENCES "public"."trading_accounts"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_balance_adjustments_scope_time_idx" ON "account_balance_adjustments" USING btree ("owner_id","trading_account_id","effective_at");