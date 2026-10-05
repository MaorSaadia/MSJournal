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
    console.error(
      error instanceof Error &&
        error.message.startsWith("Review version-controlled")
        ? error.message
        : "Migration failed. Verify DATABASE_URL and schema compatibility; no database details were logged.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
  });
