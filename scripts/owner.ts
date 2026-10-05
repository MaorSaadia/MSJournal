import { loadEnvConfig } from "@next/env";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import * as schema from "../db/schema";
import { emitKeypressEvents } from "node:readline";
import { eq } from "drizzle-orm";
import { createAuth } from "../lib/auth-options";
import { readConfig } from "../lib/config";
import { getDb, getPool, closePool } from "../db/client";
import { user } from "../db/schema";

loadEnvConfig(process.cwd());
async function hiddenPassword(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode)
    throw new Error(
      "Use an interactive terminal or the secure MSJOURNAL_OWNER_PASSWORD environment input.",
    );
  process.stdout.write(label);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("keypress", onKey);
      process.stdout.write("\n");
    };
    const onKey = (
      str: string | undefined,
      key: { name?: string; ctrl?: boolean; sequence?: string },
    ) => {
      if (key.ctrl && key.name === "c") {
        finish();
        reject(new Error("Cancelled."));
      } else if (key.name === "return" || key.name === "enter") {
        finish();
        resolve(value);
      } else if (key.name === "backspace") value = value.slice(0, -1);
      else if (str && !key.ctrl && !/[\x00-\x1f\x7f]/.test(str)) value += str;
    };
    process.stdin.on("keypress", onKey);
  });
}
async function run() {
  const mode = process.argv[2];
  if (mode !== "bootstrap" && mode !== "recover")
    throw new Error("Use owner:bootstrap or owner:recover.");
  const config = readConfig(),
    db = getDb(),
    runtimeAuth = createAuth();
  // A dedicated connection holds a lock to serialize competing owner CLI runs.
  const connection = await getPool().connect();
  try {
    await connection.query("select pg_advisory_lock(hashtext($1))", [
      `msjournal-owner:${config.OWNER_EMAIL}`,
    ]);
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, config.OWNER_EMAIL));
    if (mode === "bootstrap" && existing)
      throw new Error(
        "Owner already exists. Bootstrap refuses duplicates; use owner:recover if needed.",
      );
    if (mode === "recover" && !existing)
      throw new Error("Owner is not bootstrapped yet.");
    let password = process.env.MSJOURNAL_OWNER_PASSWORD;
    delete process.env.MSJOURNAL_OWNER_PASSWORD;
    if (!password) {
      password = await hiddenPassword("New owner password (hidden): ");
      if (password !== (await hiddenPassword("Confirm password (hidden): ")))
        throw new Error("Passwords do not match.");
    }
    if (password.length < 12 || password.length > 128)
      throw new Error("Use a password between 12 and 128 characters.");
    const cliPassword = password;
    await db.transaction(async (tx) => {
      const cliOptions = {
        ...runtimeAuth.options,
        database: drizzleAdapter(tx, {
          provider: "pg",
          schema,
          transaction: false,
        }),
      };
      if (mode === "bootstrap") {
        // Isolated local API instance. No handler is exported; public runtime signup
        // remains disabled. Better Auth performs its supported password hashing.
        const bootstrapAuth = betterAuth({
          ...cliOptions,
          emailAndPassword: {
            ...runtimeAuth.options.emailAndPassword,
            enabled: true,
            disableSignUp: false,
            autoSignIn: false,
          },
        });
        await bootstrapAuth.api.signUpEmail({
          body: {
            email: config.OWNER_EMAIL,
            password: cliPassword,
            name: "MSJournal owner",
          },
        });
      } else {
        // Supported request/reset APIs deliver a recovery token ONLY within this
        // local process. No email provider or public password-reset flow exists.
        let recoveryToken = "";
        const recoveryAuth = betterAuth({
          ...cliOptions,
          emailAndPassword: {
            ...runtimeAuth.options.emailAndPassword,
            enabled: true,
            disableSignUp: true,
            revokeSessionsOnPasswordReset: true,
            sendResetPassword: async ({ token }) => {
              recoveryToken = token;
            },
          },
        });
        await recoveryAuth.api.requestPasswordReset({
          body: { email: config.OWNER_EMAIL },
        });
        if (!recoveryToken) throw new Error("Recovery could not be initiated.");
        await recoveryAuth.api.resetPassword({
          body: { token: recoveryToken, newPassword: cliPassword },
        });
        // Library revokeSessionsOnPasswordReset invalidates all DB sessions; cookie
        // caching is disabled, so old cookies cannot restore access.
      }
    });
    console.log(
      mode === "bootstrap"
        ? "Owner created. Start MSJournal and sign in using your configured owner email."
        : "Owner password changed and previous sessions invalidated.",
    );
    password = undefined;
  } finally {
    await connection
      .query("select pg_advisory_unlock(hashtext($1))", [
        `msjournal-owner:${config.OWNER_EMAIL}`,
      ])
      .catch(() => {});
    connection.release();
  }
}
run()
  .catch((error) => {
    // Whitelist local validation messages; never print library/database errors.
    const allowed = [
      "Owner already exists.",
      "Owner is not bootstrapped",
      "Use a password",
      "Passwords do not match.",
      "Cancelled.",
      "Use an interactive terminal",
      "Configure DATABASE_URL",
      "Use owner:",
    ];
    console.error(
      error instanceof Error &&
        allowed.some((prefix) => error.message.startsWith(prefix))
        ? error.message
        : "Owner command failed. Verify environment configuration and reviewed migrations; no secrets were logged.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
  });
