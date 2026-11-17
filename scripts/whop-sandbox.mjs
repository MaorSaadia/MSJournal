// Isolated local sandbox launcher. Never alters .env.local or production settings.
import fs from "node:fs";
import { parseEnv } from "node:util";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const filename = ".env.whop-sandbox.local";
export function sandboxEnvironment(settings, production = {}) {
  for (const key of [
    "DATABASE_URL",
    "WHOP_API_KEY",
    "WHOP_BUSINESS_ID",
    "WHOP_PRO_PRODUCT_ID",
    "WHOP_PRO_MONTHLY_PLAN_ID",
    "WHOP_WEBHOOK_SECRET",
  ])
    if (!settings[key] || /REPLACE_/i.test(settings[key]))
      throw Error(`Add ${key} to ${filename}; do not paste secrets in chat.`);
  const database = new URL(settings.DATABASE_URL);
  const identity = (u) => `${u.hostname.replace("-pooler.", ".")}${u.pathname}`;
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !production.DATABASE_URL ||
    (identity(database) === identity(new URL(production.DATABASE_URL)) &&
      settings.WHOP_SANDBOX_ALLOW_SHARED_DATABASE !== "true")
  )
    throw Error(
      "Use a separate test database; the normal application database is not permitted.",
    );
  if (
    !/^biz_[A-Za-z0-9]+$/.test(settings.WHOP_BUSINESS_ID) ||
    !/^prod_[A-Za-z0-9]+$/.test(settings.WHOP_PRO_PRODUCT_ID) ||
    !/^plan_[A-Za-z0-9]+$/.test(settings.WHOP_PRO_MONTHLY_PLAN_ID) ||
    !/^ws_[A-Za-z0-9]+$/.test(settings.WHOP_WEBHOOK_SECRET)
  )
    throw Error(
      "Sandbox business, product, plan or webhook-secret format is invalid; values were not logged.",
    );
  let origin = "http://localhost:3101";
  if (settings.WHOP_SANDBOX_PUBLIC_URL) {
    const url = new URL(settings.WHOP_SANDBOX_PUBLIC_URL);
    if (url.protocol !== "https:" || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash || url.port)
      throw Error("WHOP_SANDBOX_PUBLIC_URL must be an HTTPS origin without a path or credentials.");
    origin = url.origin;
  }
  const annualEnabled = settings.WHOP_ANNUAL_CHECKOUT_ENABLED === "true";
  if (annualEnabled && (!/^plan_[A-Za-z0-9]+$/.test(settings.WHOP_PRO_ANNUAL_PLAN_ID ?? "") ||
      settings.WHOP_PRO_ANNUAL_PLAN_ID === settings.WHOP_PRO_MONTHLY_PLAN_ID))
    throw Error("Configure a distinct sandbox annual plan ID before enabling annual checkout.");
  return {
    DATABASE_URL: settings.DATABASE_URL,
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    BETTER_AUTH_URL: origin,
    WHOP_SANDBOX_PUBLIC_URL: settings.WHOP_SANDBOX_PUBLIC_URL ?? "",
    AUTH_REQUIRE_EMAIL_VERIFICATION: "false",
    RESEND_API_KEY: "",
    AUTH_EMAIL_FROM: "",
    WHOP_ENVIRONMENT: "sandbox",
    WHOP_API_KEY: settings.WHOP_API_KEY,
    WHOP_BUSINESS_ID: settings.WHOP_BUSINESS_ID,
    WHOP_PRO_PRODUCT_ID: settings.WHOP_PRO_PRODUCT_ID,
    WHOP_PRO_MONTHLY_PLAN_ID: settings.WHOP_PRO_MONTHLY_PLAN_ID,
    WHOP_WEBHOOK_SECRET: settings.WHOP_WEBHOOK_SECRET,
    WHOP_PRO_PLAN_IDS: "",
    WHOP_PRO_ANNUAL_PLAN_ID: annualEnabled ? settings.WHOP_PRO_ANNUAL_PLAN_ID : "",
    WHOP_OAUTH_CLIENT_ID: "",
    WHOP_ANNUAL_CHECKOUT_ENABLED: annualEnabled ? "true" : "false",
    WHOP_CHECKOUT_ENABLED: "true",
    WHOP_LIVE_VERIFIED: "false",
    BILLING_RECONCILE_SECRET: "",
    CRON_SECRET: "",
    NODE_ENV: "development",
    MSJOURNAL_WHOP_SANDBOX: "true",
    VERCEL_ENV: "",
  };
}
async function verify(settings) {
  const base = "https://sandbox-api.whop.com/api/v1";
  async function get(path) {
    let r;
    try {
      r = await fetch(base + path, {
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${settings.WHOP_API_KEY}`,
          "Api-Version-Date": "2026-11-12",
        },
      });
    } catch {
      throw Error("Sandbox connection failed; no server was started.");
    }
    if (!r.ok)
      throw Error(
        `Sandbox API verification failed (HTTP ${r.status}). Use sandbox credentials, not a live key.`,
      );
    return r.json();
  }
  await get(
    `/memberships?${new URLSearchParams({ account_id: settings.WHOP_BUSINESS_ID, first: "1" })}`,
  );
  const p = await get(`/variants/${settings.WHOP_PRO_MONTHLY_PLAN_ID}`);
  if (
    p.account?.id !== settings.WHOP_BUSINESS_ID ||
    p.product?.id !== settings.WHOP_PRO_PRODUCT_ID ||
    p.currency !== "usd" ||
    p.billing_type !== "renewal" ||
    p.billing_period !== 30 ||
    p.initial_price !== 0 ||
    p.renewal_price !== 9.99 ||
    p.initial_price_due?.currency !== "usd" ||
    p.initial_price_due?.amount !== "9.99" ||
    (p.trial_period_days ?? 0) !== 0
  )
    throw Error(
      "Sandbox Monthly plan must match the sandbox business/product and $9.99 USD every 30 days, without a trial/setup fee.",
    );
  if (settings.WHOP_ANNUAL_CHECKOUT_ENABLED === "true") {
    const annual = await get(`/variants/${settings.WHOP_PRO_ANNUAL_PLAN_ID}`);
    if (annual.account?.id !== settings.WHOP_BUSINESS_ID ||
        annual.product?.id !== settings.WHOP_PRO_PRODUCT_ID ||
        annual.currency !== "usd" || annual.billing_type !== "renewal" ||
        annual.billing_period !== 365 || annual.initial_price !== 0 ||
        annual.renewal_price !== 89.99 || annual.initial_price_due?.currency !== "usd" ||
        annual.initial_price_due?.amount !== "89.99" || (annual.trial_period_days ?? 0) !== 0)
      throw Error("Sandbox annual plan must match the Pro product and $89.99 USD every 365 days, without a trial/setup fee.");
    console.log("Sandbox annual pricing verified; both schedules grant the same Pro entitlement.");
  }
}
async function main() {
  if (!fs.existsSync(filename))
    throw Error(
      `Create ${filename} from docs/whop-sandbox.env.example first. Your normal environment has not changed.`,
    );
  const production = fs.existsSync(".env.local")
    ? parseEnv(fs.readFileSync(".env.local", "utf8"))
    : {};
  const settings = parseEnv(fs.readFileSync(filename, "utf8"));
  if (settings.WHOP_SANDBOX_ALLOW_SHARED_DATABASE === "true") {
    if (process.argv.includes("--migrate"))
      throw Error("Shared-database sandbox mode does not run migrations.");
    console.log("Using the existing database by explicit choice. Sign up a disposable test user; do not use your normal login.");
  }
  const sandbox = sandboxEnvironment(
    settings,
    production,
  );
  await verify(sandbox);
  console.log(
    "Sandbox API and Monthly pricing verified. Production checkout stays disabled.",
  );
  if (process.argv.includes("--check")) return;
  const env = { ...process.env, ...sandbox };
  // Never inherit production image-storage credentials into a disposable run.
  for (const key of new Set([...Object.keys(env), ...Object.keys(production)]))
    if (key.startsWith("SCREENSHOT_S3_")) env[key] = "";
  const migrate = process.argv.includes("--migrate");
  const args = migrate
    ? ["--import", "tsx", "scripts/migrate.ts", "--reviewed"]
    : [
        "node_modules/next/dist/bin/next",
        "dev",
        "--port",
        "3101",
        "--hostname",
        "127.0.0.1",
      ];
  console.log(
    migrate
      ? "Applying migrations to the isolated test database."
      : `Open ${sandbox.BETTER_AUTH_URL} and sign up a disposable test user. Only sandbox checkout is enabled in this process.`,
  );
  const child = spawn(process.execPath, args, {
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])
)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
