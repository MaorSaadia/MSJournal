ALTER TABLE "billing_profiles" ADD COLUMN "complimentary_pro_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD COLUMN "complimentary_granted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD COLUMN "complimentary_reason" text;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION msjournal_is_pro(p_owner text) RETURNS boolean LANGUAGE sql VOLATILE AS $$
  SELECT EXISTS(SELECT 1 FROM billing_profiles WHERE owner_id=p_owner
    AND complimentary_pro_until>clock_timestamp()) OR EXISTS(SELECT 1 FROM billing_memberships WHERE owner_id=p_owner
    AND environment=coalesce(nullif(current_setting('msjournal.billing_environment',true),''),'live')
    AND business_id=current_setting('msjournal.billing_business',true)
    AND product_id=current_setting('msjournal.billing_product',true)
    AND plan_id=ANY(regexp_split_to_array(coalesce(current_setting('msjournal.billing_plans',true),''),'\s*,\s*'))
    AND has_access=true AND eligible_until>clock_timestamp());
$$;
