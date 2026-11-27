ALTER TABLE "user_preferences" ALTER COLUMN "display_timezone" SET DEFAULT 'America/New_York';
--> statement-breakpoint
-- Preserve the previous display default for existing users without preferences.
INSERT INTO "user_preferences" ("user_id", "display_timezone")
SELECT "id", 'Asia/Jerusalem'
FROM "auth_users"
WHERE NOT EXISTS (
  SELECT 1 FROM "user_preferences" WHERE "user_id" = "auth_users"."id"
)
ON CONFLICT ("user_id") DO NOTHING;
