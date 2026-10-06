import { loadEnvConfig } from "@next/env";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../db/schema";
import { getPool, closePool } from "../db/client";
import { readConfig, emailConfigured } from "../lib/config";
loadEnvConfig(process.cwd());
async function run() {
  const config = readConfig();
  console.log(
    JSON.stringify({
      configured: true,
      authOrigin: config.BETTER_AUTH_URL,
      secureCookies: new URL(config.BETTER_AUTH_URL).protocol === "https:",
      emailConfigured: emailConfigured(config),
      verificationRequired: config.AUTH_REQUIRE_EMAIL_VERIFICATION === "true",
    }),
  );
  const pool = getPool();
  for (const table of Object.values(schema)) {
    const expected = getTableConfig(table);
    const columns = await pool.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name=$1",
      [expected.name],
    );
    if (
      !expected.columns.every((col) =>
        columns.rows.some((row) => row.column_name === col.name),
      )
    )
      throw new Error("Schema mismatch");
  }
  const migration = await pool.query(
    "select to_regclass('drizzle.__drizzle_migrations') is not null as present",
  );
  const records = await pool.query(
    "select (select count(*)::int from auth_users) as users, count(*)::int as credential_accounts, count(*) filter (where password ~ '^[0-9a-f]+:[0-9a-f]+$')::int as library_format_hashes from auth_accounts where provider_id='credential'",
  );
  console.log(
    JSON.stringify({
      databaseReachable: true,
      schemaColumnsMatch: true,
      migrationHistoryPresent: migration.rows[0].present,
      ...records.rows[0],
    }),
  );
  console.log(
    "Hash format is a compatibility check, not proof of password correctness. No passwords, tokens, record identifiers, or connection strings are printed.",
  );
}
run()
  .catch(() => {
    console.error(
      "Auth diagnostics failed. Verify the environment and reviewed migrations; sensitive details are suppressed.",
    );
    process.exitCode = 1;
  })
  .finally(() => closePool());
