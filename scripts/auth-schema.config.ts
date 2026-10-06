// Schema inspection only: never mounted in Next.js and never opens a DB connection.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { randomBytes } from "node:crypto";
export const auth = betterAuth({
  secret: randomBytes(32).toString("base64"),
  baseURL: "http://localhost:3000",
  database: drizzleAdapter(drizzle(new Pool()), { provider: "pg" }),
  user: { modelName: "auth_users" },
  session: { modelName: "auth_sessions", cookieCache: { enabled: false } },
  account: { modelName: "auth_accounts" },
  verification: { modelName: "auth_verifications" },
  emailAndPassword: { enabled: true },
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "auth_rate_limits",
  },
  logger: { disabled: true },
});
