import { loadEnvConfig } from "@next/env";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb, closePool } from "../db/client";
loadEnvConfig(process.cwd());
async function run() {
  if (!process.argv.includes("--reviewed"))
    throw new Error(
      "Review version-controlled SQL in drizzle/ first, then run npm.cmd run db:migrate -- --reviewed.",
    );
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log("Reviewed migrations applied.");
}
run()
  .catch((error) => {
    const codes: string[] = [];
    let cause: unknown = error;
    for (let i = 0; cause && i < 5; i++) {
      const item = cause as { code?: string; cause?: unknown };
      if (item.code && /^[A-Z0-9_]{2,30}$/.test(item.code))
        codes.push(item.code);
      cause = item.cause;
    }
    console.error(
      error instanceof Error &&
        error.message.startsWith("Review version-controlled")
        ? error.message
        : "Migration failed. Verify DATABASE_URL and schema compatibility; no database details were logged.",
    );
    if (codes.length) console.error("Safe diagnostic codes:", codes.join(", "));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
  });
