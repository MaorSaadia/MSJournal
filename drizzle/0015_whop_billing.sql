CREATE TABLE "billing_checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"environment" text NOT NULL,
	"plan_id" text NOT NULL,
	"nonce_hash" text NOT NULL,
	"configuration_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_identities" (
	"owner_id" text NOT NULL,
	"environment" text NOT NULL,
	"whop_user_id" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_identities_owner_id_environment_pk" PRIMARY KEY("owner_id","environment"),
	CONSTRAINT "billing_identity_environment" CHECK ("billing_identities"."environment" in ('sandbox','live'))
);
--> statement-breakpoint
CREATE TABLE "billing_memberships" (
	"environment" text NOT NULL,
	"membership_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"whop_user_id" text NOT NULL,
	"business_id" text NOT NULL,
	"product_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"status" text NOT NULL,
	"has_access" boolean NOT NULL,
	"cancel_at_period_end" boolean NOT NULL,
	"period_end" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"provider_updated_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"eligible_until" timestamp with time zone NOT NULL,
	"manage_url" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refresh_failed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "billing_memberships_environment_membership_id_pk" PRIMARY KEY("environment","membership_id"),
	CONSTRAINT "billing_membership_environment" CHECK ("billing_memberships"."environment" in ('sandbox','live'))
);
--> statement-breakpoint
CREATE TABLE "billing_oauth_states" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"environment" text NOT NULL,
	"verifier" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_profiles" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"free_account_id" uuid,
	"selected_at" timestamp with time zone,
	"refreshed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_webhook_events" (
	"environment" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"membership_id" text,
	"payment_id" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "billing_webhook_events_environment_event_id_pk" PRIMARY KEY("environment","event_id")
);
--> statement-breakpoint
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_identities" ADD CONSTRAINT "billing_identities_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_memberships" ADD CONSTRAINT "billing_memberships_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_oauth_states" ADD CONSTRAINT "billing_oauth_states_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_free_account_id_trading_accounts_id_fk" FOREIGN KEY ("free_account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkout_nonce" ON "billing_checkouts" USING btree ("nonce_hash");--> statement-breakpoint
CREATE INDEX "billing_checkout_owner" ON "billing_checkouts" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkout_configuration" ON "billing_checkouts" USING btree ("environment","configuration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_identity_unique" ON "billing_identities" USING btree ("environment","whop_user_id");--> statement-breakpoint
CREATE INDEX "billing_membership_owner" ON "billing_memberships" USING btree ("owner_id","environment");--> statement-breakpoint
CREATE INDEX "billing_membership_refresh" ON "billing_memberships" USING btree ("environment","checked_at");--> statement-breakpoint
CREATE INDEX "billing_webhook_pending" ON "billing_webhook_events" USING btree ("environment","state","received_at");
--> statement-breakpoint
-- All real account capacity changes serialize on one owner lock, including direct
-- SQL writes. Archived accounts count; deletion alone removes an account slot.
CREATE FUNCTION msjournal_is_pro(p_owner text) RETURNS boolean LANGUAGE sql VOLATILE AS $$
  SELECT EXISTS(SELECT 1 FROM billing_memberships WHERE owner_id=p_owner
    AND environment=coalesce(nullif(current_setting('msjournal.billing_environment',true),''),'live')
    AND business_id=current_setting('msjournal.billing_business',true)
    AND product_id=current_setting('msjournal.billing_product',true)
    AND plan_id=ANY(regexp_split_to_array(coalesce(current_setting('msjournal.billing_plans',true),''),'\s*,\s*'))
    AND has_access=true AND eligible_until>clock_timestamp());
$$;
--> statement-breakpoint
CREATE FUNCTION msjournal_assert_new_account(p_owner text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('billing:'||p_owner,0));
  INSERT INTO billing_profiles(owner_id) VALUES(p_owner) ON CONFLICT DO NOTHING;
  IF NOT msjournal_is_pro(p_owner) AND EXISTS(SELECT 1 FROM trading_accounts WHERE owner_id=p_owner) THEN
    RAISE EXCEPTION 'Account allowance reached' USING HINT='MSJOURNAL_PLAN_LIMIT';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION msjournal_assert_account_activity(p_owner text,p_account uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE selected uuid; total integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('billing:'||p_owner,0));
  IF NOT EXISTS(SELECT 1 FROM trading_accounts WHERE id=p_account AND owner_id=p_owner) THEN
    RAISE EXCEPTION 'Account unavailable' USING HINT='MSJOURNAL_ACCOUNT_NOT_FOUND';
  END IF;
  INSERT INTO billing_profiles(owner_id) VALUES(p_owner) ON CONFLICT DO NOTHING;
  IF msjournal_is_pro(p_owner) THEN RETURN; END IF;
  SELECT count(*) INTO total FROM trading_accounts WHERE owner_id=p_owner;
  SELECT free_account_id INTO selected FROM billing_profiles WHERE owner_id=p_owner;
  IF selected IS NULL AND total=1 THEN
    UPDATE billing_profiles SET free_account_id=p_account,selected_at=clock_timestamp(),updated_at=clock_timestamp() WHERE owner_id=p_owner;
    selected:=p_account;
  END IF;
  IF selected IS DISTINCT FROM p_account THEN
    RAISE EXCEPTION 'Select your Free account or upgrade' USING HINT='MSJOURNAL_PLAN_LIMIT';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION msjournal_account_capacity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM msjournal_assert_new_account(NEW.owner_id);
  ELSIF TG_OP='UPDATE' THEN
    -- Archiving is data management and remains available for retained accounts.
    IF (to_jsonb(NEW)-'archived_at'-'updated_at'-'start_date') IS DISTINCT FROM (to_jsonb(OLD)-'archived_at'-'updated_at'-'start_date') OR (OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL) THEN
      PERFORM msjournal_assert_account_activity(NEW.owner_id,NEW.id);
    END IF;
    IF NEW.firm IS DISTINCT FROM OLD.firm AND (EXISTS(SELECT 1 FROM import_batches WHERE trading_account_id=OLD.id AND owner_id=OLD.owner_id)
      OR EXISTS(SELECT 1 FROM prop_phases WHERE trading_account_id=OLD.id AND owner_id=OLD.owner_id)) THEN
      RAISE EXCEPTION 'Firm history cannot be relabeled' USING HINT='MSJOURNAL_ACCOUNT_HISTORY';
    END IF;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended('billing:'||OLD.owner_id,0));
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER msjournal_account_capacity BEFORE INSERT OR UPDATE OR DELETE ON trading_accounts FOR EACH ROW EXECUTE FUNCTION msjournal_account_capacity_guard();
--> statement-breakpoint
CREATE FUNCTION msjournal_first_free_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT msjournal_is_pro(NEW.owner_id) THEN
    UPDATE billing_profiles SET free_account_id=NEW.id,selected_at=clock_timestamp(),updated_at=clock_timestamp()
      WHERE owner_id=NEW.owner_id AND free_account_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER msjournal_first_account AFTER INSERT ON trading_accounts FOR EACH ROW EXECUTE FUNCTION msjournal_first_free_account();
--> statement-breakpoint
CREATE FUNCTION msjournal_activity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM msjournal_assert_account_activity(NEW.owner_id,NEW.trading_account_id);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER msjournal_import_activity BEFORE INSERT ON import_batches FOR EACH ROW EXECUTE FUNCTION msjournal_activity_guard();
--> statement-breakpoint
CREATE TRIGGER msjournal_source_activity BEFORE INSERT OR UPDATE ON tradovate_performance_records FOR EACH ROW EXECUTE FUNCTION msjournal_activity_guard();
--> statement-breakpoint
CREATE TRIGGER msjournal_order_activity BEFORE INSERT OR UPDATE ON tradovate_order_records FOR EACH ROW EXECUTE FUNCTION msjournal_activity_guard();
--> statement-breakpoint
-- Reassociation during journal processing is maintenance, not new user activity.
CREATE TRIGGER msjournal_review_activity BEFORE UPDATE OF fields,status ON journal_reviews FOR EACH ROW WHEN(NEW.fields IS DISTINCT FROM OLD.fields OR NEW.status IS DISTINCT FROM OLD.status) EXECUTE FUNCTION msjournal_activity_guard();
--> statement-breakpoint
CREATE TRIGGER msjournal_assignment_activity BEFORE UPDATE OF answers,strategy_id,playbook_revision ON strategy_assignments FOR EACH ROW WHEN(NEW.answers IS DISTINCT FROM OLD.answers OR NEW.strategy_id IS DISTINCT FROM OLD.strategy_id OR NEW.playbook_revision IS DISTINCT FROM OLD.playbook_revision) EXECUTE FUNCTION msjournal_activity_guard();
