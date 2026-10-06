import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { getDb } from "../db/client";
import * as schema from "../db/schema";
import { readConfig } from "./config";
import { sendAuthEmail } from "./auth-email";

export function createAuth() {
  const config = readConfig();
  const requireVerification = config.AUTH_REQUIRE_EMAIL_VERIFICATION === "true";
  return betterAuth({
    appName: "MSJournal",
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL,
    trustedOrigins: [new URL(config.BETTER_AUTH_URL).origin],
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema,
      transaction: true,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
      autoSignIn: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: requireVerification,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendAuthEmail(user.email, url, "reset");
      },
    },
    emailVerification: {
      sendOnSignUp: requireVerification,
      sendOnSignIn: requireVerification,
      autoSignInAfterVerification: true,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) => {
        await sendAuthEmail(user.email, url, "verify");
      },
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
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: new URL(config.BETTER_AUTH_URL).protocol === "https:",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    logger: { disabled: true },
  });
}
