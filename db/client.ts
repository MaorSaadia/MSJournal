import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { readConfig } from "../lib/config";
const globalDatabase = globalThis as typeof globalThis & {
  msjournalPool?: Pool;
};
export function getPool() {
  if (!globalDatabase.msjournalPool) {
    globalDatabase.msjournalPool = new Pool({
      connectionString: readConfig().DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: true,
    });
    // Do not log pg errors: some contain connection credentials or SQL values.
    globalDatabase.msjournalPool.on("error", () => {});
  }
  return globalDatabase.msjournalPool;
}
export function getDb() {
  return drizzle({ client: getPool(), schema });
}
export async function closePool() {
  const pool = globalDatabase.msjournalPool;
  globalDatabase.msjournalPool = undefined;
  if (pool) await pool.end();
}
