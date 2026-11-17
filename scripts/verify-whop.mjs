// Read-only verification. Never prints provider payloads, credentials or tokens.
import nextEnv from "@next/env";
import { writeFile, mkdir } from "node:fs/promises";
nextEnv.loadEnvConfig(process.cwd());
const env = process.env,
  version = "2026-11-12";
const origin = new URL(env.SITE_URL ?? "https://ms-journal.vercel.app").origin;
const monthly = env.WHOP_PRO_MONTHLY_PLAN_ID?.trim(),
  business = env.WHOP_BUSINESS_ID?.trim();
const report = {
  origin,
  releaseFlagsOff:
    env.WHOP_CHECKOUT_ENABLED !== "true" && env.WHOP_LIVE_VERIFIED !== "true",
  configuredEnvironment: env.WHOP_ENVIRONMENT ?? "missing",
  annualCheckoutEnabled: env.WHOP_ANNUAL_CHECKOUT_ENABLED === "true",
  missingRequiredVariables: [
    "WHOP_API_KEY",
    "WHOP_BUSINESS_ID",
    "WHOP_PRO_PRODUCT_ID",
    "WHOP_PRO_MONTHLY_PLAN_ID",
    "WHOP_WEBHOOK_SECRET",
    "WHOP_OAUTH_CLIENT_ID",
    "BILLING_RECONCILE_SECRET",
  ].filter((k) => !env[k]?.trim()),
  schedulerSecretPairMatches:
    !!env.CRON_SECRET && env.CRON_SECRET === env.BILLING_RECONCILE_SECRET,
  environments: {},
  deployment: {},
};
async function read(base, path, key) {
  try {
    const r = await fetch(base + path, {
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
        "Api-Version-Date": version,
      },
    });
    let data = null;
    if (r.ok)
      try {
        data = await r.json();
      } catch {}
    return { status: r.status, data };
  } catch {
    return { status: "connection_failed", data: null };
  }
}
if (!report.releaseFlagsOff)
  throw Error("Turn both release flags off before verification.");
if (!/^biz_[A-Za-z0-9]+$/.test(business ?? "") || !env.WHOP_API_KEY)
  throw Error(
    "Business ID or API key is missing/invalid. Values were not logged.",
  );
for (const environment of [
  env.WHOP_ENVIRONMENT,
  env.WHOP_ENVIRONMENT === "sandbox" ? "live" : "sandbox",
].filter((x, i, a) => ["sandbox", "live"].includes(x) && a.indexOf(x) === i)) {
  const base =
    environment === "sandbox"
      ? "https://sandbox-api.whop.com/api/v1"
      : "https://api.whop.com/api/v1";
  const membershipAccess = await read(
    base,
    `/memberships?${new URLSearchParams({ account_id: business, first: "1" })}`,
    env.WHOP_API_KEY,
  );
  const accountAccess = await read(
    base,
    `/accounts/${business}`,
    env.WHOP_API_KEY,
  );
  const variant = /^plan_[A-Za-z0-9]+$/.test(monthly ?? "")
    ? await read(
        base,
        `/variants/${encodeURIComponent(monthly)}`,
        env.WHOP_API_KEY,
      )
    : { status: "invalid_configured_monthly_id", data: null };
  const result = { monthlyReadStatus: variant.status };
  report.environments[environment] = result;
  result.businessMembershipRead = { status: membershipAccess.status };
  result.accountRead = {
    status: accountAccess.status,
    idMatches: accountAccess.data?.id === business,
  };
  const variants = await read(
    base,
    `/variants?${new URLSearchParams({ account_id: business, first: "100" })}`,
    env.WHOP_API_KEY,
  );
  result.variants = { status: variants.status };
  if (Array.isArray(variants.data?.data))
    result.variants.items = variants.data.data
      .filter((p) => p.account?.id === business)
      .map((p) => ({
        id: p.id,
        title: p.title,
        productId: p.product?.id ?? null,
        currency: p.currency,
        billingType: p.billing_type,
        billingPeriod: p.billing_period,
        renewalPrice: p.renewal_price,
        initialPrice: p.initial_price,
        trialDays: p.trial_period_days,
      }));
  const candidates = (variants.data?.data ?? []).filter(
    (p) =>
      p.account?.id === business &&
      p.billing_type === "renewal" &&
      p.currency === "usd" &&
      p.billing_period === 30 &&
      p.renewal_price === 9.99 &&
      p.initial_price === 0 &&
      !(p.trial_period_days > 0),
  );
  const discovered =
    !variant.data && candidates.length === 1
      ? await read(
          base,
          `/variants/${encodeURIComponent(candidates[0].id)}`,
          env.WHOP_API_KEY,
        )
      : null;
  const p = variant.data ?? discovered?.data;
  if (p) {
    if (discovered) result.monthlyCandidateStatus = discovered.status;
    result.monthly = {
      idMatches: p.id === monthly,
      businessMatches: p.account?.id === business,
      productId: /^prod_[A-Za-z0-9]+$/.test(p.product?.id ?? "")
        ? p.product.id
        : null,
      configuredProductMatches:
        !!env.WHOP_PRO_PRODUCT_ID && p.product?.id === env.WHOP_PRO_PRODUCT_ID,
      currency: p.currency,
      billingType: p.billing_type,
      billingPeriod: p.billing_period,
      renewalPrice: p.renewal_price,
      initialPrice: p.initial_price,
      firstPaymentAmount: p.initial_price_due?.amount ?? null,
      trialDays: p.trial_period_days,
    };
    result.monthly.verifiedCandidateId = /^plan_[A-Za-z0-9]+$/.test(p.id ?? "")
      ? p.id
      : null;
    const productId = result.monthly.productId;
    if (productId) {
      const product = await read(
        base,
        `/products/${productId}`,
        env.WHOP_API_KEY,
      );
      result.product = {
        status: product.status,
        businessMatches: product.data?.account?.id === business,
        idMatches: product.data?.id === productId,
        title: product.data?.title ?? null,
      };
    }
  }
  const webhooks = await read(
    base,
    `/webhooks?${new URLSearchParams({ account_id: business, first: "100" })}`,
    env.WHOP_API_KEY,
  );
  result.webhooks = { status: webhooks.status };
  if (Array.isArray(webhooks.data?.data))
    result.webhooks.items = webhooks.data.data.map((w) => ({
      id: w.id,
      urlMatches: w.url === `${origin}/api/webhooks/whop`,
      enabled: w.enabled,
      apiVersion: w.api_version,
      apiVersionDate: w.api_version_date,
      events: w.events,
      resourceMatches: w.resource_id === business,
      secretMatches:
        typeof w.webhook_secret === "string"
          ? w.webhook_secret === env.WHOP_WEBHOOK_SECRET
          : null,
      consecutiveFailures: w.consecutive_failures,
      failingSince: w.failing_since,
      lastFailureAt: w.last_failure_at,
    }));
  if (/^app_[A-Za-z0-9]+$/.test(env.WHOP_OAUTH_CLIENT_ID ?? "")) {
    const app = await read(
      base,
      `/apps/${env.WHOP_OAUTH_CLIENT_ID}`,
      env.WHOP_API_KEY,
    );
    result.oauth = {
      status: app.status,
      clientType: app.data?.oauth_client_type ?? null,
      registeredRedirectCount: Array.isArray(app.data?.redirect_uris)
        ? app.data.redirect_uris.length
        : null,
      callbackRegistered:
        app.data?.redirect_uris?.includes(
          `${origin}/api/billing/whop/callback`,
        ) ?? false,
      configuredCallback: `${origin}/api/billing/whop/callback`,
      businessMatches: app.data?.account?.id === business,
    };
  }
}
for (const path of ["/", "/api/billing", "/api/billing/reconcile"]) {
  try {
    const r = await fetch(origin + path, {
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    report.deployment[path] = {
      status: r.status,
      redirect: r.headers.get("location"),
    };
  } catch {
    report.deployment[path] = { status: "connection_failed" };
  }
}
try {
  const r = await fetch(`${origin}/api/webhooks/whop`, {
    method: "OPTIONS",
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });
  report.deployment.webhookOptions = {
    status: r.status,
    allow: r.headers.get("allow"),
  };
} catch {
  report.deployment.webhookOptions = { status: "connection_failed" };
}
if (env.BILLING_RECONCILE_SECRET) {
  for (const [label, token] of [
    ["wrongSecret", "verification-invalid-token"],
    ["configuredSecret", env.BILLING_RECONCILE_SECRET],
  ]) {
    try {
      const r = await fetch(`${origin}/api/billing/reconcile`, {
        redirect: "manual",
        signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${token}` },
      });
      let counts = null;
      if (r.ok) {
        try {
          const body = await r.json();
          counts = {
            events: typeof body.events === "number" ? body.events : null,
            memberships:
              typeof body.memberships === "number" ? body.memberships : null,
          };
        } catch {}
      }
      report.deployment[label] = { status: r.status, counts };
    } catch {
      report.deployment[label] = { status: "connection_failed" };
    }
  }
}
await mkdir("artifacts/billing", { recursive: true });
await writeFile(
  "artifacts/billing/verification.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
