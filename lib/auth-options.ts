import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import * as schema from "../db/schema";
import { readConfig } from "./config";
import { isOwner } from "./auth-policy";

// Lazy construction allows a build without credentials; no fallback auth secrets.
export function createAuth() {
  const config = readConfig(),
    db = getDb();
  return betterAuth({
    appName: "MSJournal",
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL,
    trustedOrigins: [new URL(config.BETTER_AUTH_URL).origin],
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    account: { accountLinking: { enabled: false } },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: { "/sign-in/email": { window: 60, max: 5 } },
    },
    advanced: {
      useSecureCookies: new URL(config.BETTER_AUTH_URL).protocol === "https:",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    logger: { disabled: true },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ctx.path === "/sign-in/email" &&
          (!ctx.body?.email ||
            !isOwner(String(ctx.body.email), config.OWNER_EMAIL))
        )
          throw new APIError("UNAUTHORIZED", {
            message: "Invalid email or password.",
          });
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (data) => {
            if (!isOwner(data.email, config.OWNER_EMAIL))
              throw new APIError("FORBIDDEN", {
                message: "Private workspace.",
              });
          },
        },
      },
      session: {
        create: {
          before: async (data) => {
            const [owner] = await db
              .select({ email: schema.user.email })
              .from(schema.user)
              .where(eq(schema.user.id, data.userId));
            if (!owner || !isOwner(owner.email, config.OWNER_EMAIL))
              throw new APIError("FORBIDDEN", {
                message: "Private workspace.",
              });
          },
        },
      },
    },
  });
}
