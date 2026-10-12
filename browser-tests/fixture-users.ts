import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { Page } from "@playwright/test";
const emails = new Set<string>();
export function disposableUser() {
  const id = randomUUID();
  const user = {
    name: "Disposable journal user",
    email: `msjournal-test-${id}@example.invalid`,
    password: randomBytes(24).toString("hex"),
  };
  emails.add(user.email);
  return user;
}
export async function cleanupUsers() {
  if (!emails.size) return;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  });
  pool.on("error", () => {});
  const connection = await pool.connect();
  try {
    await connection.query("begin");
    for (const email of emails) {
      if (!/^msjournal-test-[0-9a-f-]+@example\.invalid$/.test(email))
        throw new Error("Fixture guard failed");
      const { rows } = await connection.query(
        "select id from auth_users where email=$1",
        [email],
      );
      for (const row of rows) {
        for (const table of [
          "prop_events",
          "prop_snapshots",
          "prop_rule_versions",
          "prop_phases",
          "account_balance_adjustments",
          "review_attachments",
          "review_sources",
          "journal_reviews",
          "review_tags",
          "journal_sources",
          "journal_portion_fees",
          "journal_records",
          "journal_processing",
          "account_fee_settings",
          "import_provenance",
          "import_files",
          "import_batches",
          "tradovate_order_records",
          "tradovate_performance_records",
        ]) {
          await connection.query(`delete from ${table} where owner_id=$1`, [
            row.id,
          ]);
        }
        await connection.query(
          "delete from trading_accounts where owner_id=$1",
          [row.id],
        );
        await connection.query(
          "delete from auth_verifications where value=$1",
          [row.id],
        );
        await connection.query(
          "delete from auth_users where id=$1 and email=$2",
          [row.id, email],
        );
      }
    }
    await connection.query("commit");
    emails.clear();
  } catch {
    await connection.query("rollback");
    throw new Error(
      "Disposable fixture cleanup failed; no private details were logged.",
    );
  } finally {
    connection.release();
    await pool.end();
  }
}
export async function fillPassword(
  page: Page,
  label: string,
  password: string,
) {
  try {
    await page.getByLabel(label, { exact: true }).fill(password);
  } catch {
    throw new Error("Unable to enter the disposable password.");
  }
}
