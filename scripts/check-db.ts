import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { getPool, closePool } from "../db/client";

loadEnvConfig(process.cwd());
async function run() {
  const connection = await getPool().connect();
  try {
    await connection.query("begin");
    const owner = randomUUID(),
      id = randomUUID(),
      identifier = `000-${randomUUID()}`;
    await connection.query(
      "insert into auth_users (id, name, email) values ($1, $2, $3)",
      [owner, "Rollback-only fixture", `${owner}@fixture.invalid`],
    );
    await connection.query(
      "insert into trading_accounts (id, owner_id, display_name, stage, nominal_size, broker_identifier) values ($1, $2, $3, 'Personal', $4, $5)",
      [id, owner, "Rollback-only account", "50000.01", identifier],
    );
    const read = async () =>
      (
        await connection.query(
          "select nominal_size, broker_identifier, archived_at from trading_accounts where id=$1 and owner_id=$2",
          [id, owner],
        )
      ).rows[0];
    assert.equal((await read()).nominal_size, "50000.01");
    assert.equal((await read()).broker_identifier, identifier);
    await connection.query(
      "update trading_accounts set nominal_size=$1 where id=$2 and owner_id=$3",
      ["75000.02", id, owner],
    );
    assert.equal((await read()).nominal_size, "75000.02");
    assert.equal(
      (
        await connection.query(
          "select id from trading_accounts where id=$1 and owner_id=$2",
          [id, randomUUID()],
        )
      ).rowCount,
      0,
    );
    await connection.query(
      "update trading_accounts set archived_at=now() where id=$1 and owner_id=$2",
      [id, owner],
    );
    assert.ok((await read()).archived_at);
    await connection.query("savepoint duplicate_check");
    let duplicateRejected = false;
    try {
      await connection.query(
        "insert into trading_accounts (owner_id, display_name, stage, nominal_size, broker_identifier) values ($1, 'Duplicate fixture', 'Personal', 1, $2)",
        [owner, identifier],
      );
    } catch (error) {
      duplicateRejected = (error as { code?: string }).code === "23505";
    }
    await connection.query("rollback to savepoint duplicate_check");
    assert.ok(duplicateRejected);
    await connection.query(
      "update trading_accounts set archived_at=null where id=$1 and owner_id=$2",
      [id, owner],
    );
    assert.equal((await read()).archived_at, null);
  } finally {
    try {
      await connection.query("rollback");
    } finally {
      connection.release();
    }
  }
  console.log(
    "Database checks passed: exact amounts, text identifiers, edit/read, owner predicate, archive, duplicate protection while archived, restore. All fixtures were rolled back.",
  );
}
run()
  .catch(() => {
    console.error(
      "Database checks failed. Verify configuration and reviewed migrations; no record values or database details were logged.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
  });
