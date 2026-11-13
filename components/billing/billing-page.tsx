"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ExternalLink, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading";
import { confirmAction } from "@/components/ui/confirm-action";
import { requestJson } from "@/lib/client-api";
import { journalTimestamp } from "@/lib/timezones";
import type { BillingStatus } from "@/lib/billing/status";
import {
  annualSaving,
  annualEquivalent,
  proPricing,
} from "@/lib/billing/pricing";
const statusLabels: Record<string, string> = {
  active: "Active",
  trialing: "Access confirmed by Whop",
  past_due: "Payment needs attention",
  completed: "Access confirmed",
  canceled: "Canceled",
  expired: "Expired",
  unresolved: "Needs verification",
  canceling: "Scheduled to end",
  drafted: "Pending",
};
export function BillingPage({ initial }: { initial: BillingStatus }) {
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const router = useRouter(),
    search = useSearchParams(),
    pending = search.get("checkout") === "pending",
    link = search.get("link");
  const accept = useCallback(
    (next: BillingStatus) => {
      if (next.userId !== initial.userId) return;
      setData(next);
    },
    [initial.userId],
  );
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void requestJson<BillingStatus>("/api/billing")
        .then((next) => {
          if (active) accept(next);
        })
        .catch(() => {});
    refresh();
    const timer = pending ? setInterval(refresh, 5000) : undefined;
    const stop = pending
      ? setTimeout(() => clearInterval(timer), 120000)
      : undefined;
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      clearTimeout(stop);
      window.removeEventListener("focus", refresh);
    };
  }, [accept, pending]);
  async function action(body: Record<string, unknown>, key: string) {
    if (busy) return;
    setBusy(key);
    setError("");
    setMessage("");
    try {
      const result = await requestJson<BillingStatus | { url: string }>(
        "/api/billing",
        { method: "POST", body: JSON.stringify(body) },
      );
      if ("url" in result) {
        window.location.assign(result.url);
        return;
      }
      accept(result);
      setMessage(
        body.action === "select"
          ? "Your Free account is selected. Other accounts and history are kept."
          : "Subscription status refreshed.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "This action could not finish. Please try again.",
      );
    } finally {
      setBusy("");
    }
  }
  const subscription = data.subscription;
  const end = subscription?.expiresAt ?? subscription?.periodEnd;
  const needsConfirmation =
    data.plan === "Free" &&
    subscription &&
    ["active", "trialing", "past_due", "completed", "canceling"].includes(
      subscription.status,
    );
  return (
    <div className="billing-page">
      <header className="page-header">
        <div>
          <div className="breadcrumb">
            <Link href="/settings">Settings</Link> / Billing
          </div>
          <h1>
            Your plan<span className="title-dot">.</span>
          </h1>
          <p className="page-description">
            A clear place for your account allowance and subscription.
          </p>
        </div>
      </header>
      {pending && data.plan !== "Pro" && (
        <div className="billing-message" role="status">
          <strong>Waiting for subscription confirmation</strong>
          <p>
            Returning from checkout doesn’t activate Pro by itself. We’ll show
            your access when the subscription is confirmed. Your existing data
            stays available.
          </p>
          <Button
            variant="ghost"
            onClick={() =>
              router.replace("/settings/billing?checkout=canceled")
            }
          >
            I canceled checkout
          </Button>
        </div>
      )}
      {search.get("checkout") === "canceled" && (
        <p className="billing-message">
          Checkout canceled. Your current plan is unchanged.
        </p>
      )}
      {link === "canceled" && (
        <p className="billing-message">
          Subscription linking was canceled. Your plan is unchanged.
        </p>
      )}
      {link === "failed" && (
        <p role="alert" className="billing-message">
          Subscription linking could not finish. Please try connecting again
          from this page.
        </p>
      )}
      {link === "checked" && (
        <p className="billing-message">
          Your Whop account was checked. Your confirmed plan is shown below.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error billing-message">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="billing-message positive">
          {message}
        </p>
      )}
      <section className="panel billing-current">
        <div className="billing-plan-heading">
          <span className="billing-upgrade-icon">
            <Layers3 size={25} />
          </span>
          <div>
            <p className="eyebrow">CURRENT PLAN</p>
            <h2>MSJournal {data.plan}</h2>
            <p>
              {data.plan === "Pro"
                ? "Pro · Multiple accounts"
                : data.needsSelection
                  ? "Choose one account for Free use"
                  : `${Math.min(data.usage, 1)} of 1 account used`}
            </p>
          </div>
        </div>
        <dl className="billing-details">
          <div>
            <dt>Trading accounts retained</dt>
            <dd>
              {data.usage} <small>including archived</small>
            </dd>
          </div>
          <div>
            <dt>Subscription</dt>
            <dd>
              {needsConfirmation
                ? "Access needs confirmation"
                : subscription
                  ? (statusLabels[subscription.status] ?? "Needs verification")
                  : "Free"}
            </dd>
          </div>
          {end && (
            <div>
              <dt>
                {subscription?.cancelAtPeriodEnd || subscription?.expiresAt
                  ? "Access end"
                  : "Renewal"}
              </dt>
              <dd>{journalTimestamp(end, data.timezone)}</dd>
            </div>
          )}
          {subscription && (
            <div>
              <dt>Last confirmed</dt>
              <dd>
                {journalTimestamp(subscription.verifiedAt, data.timezone)}
              </dd>
            </div>
          )}
        </dl>
        {subscription?.cancelAtPeriodEnd && data.plan === "Pro" && (
          <p className="small muted">
            Future renewal is canceled. Confirmed access continues until the
            access-end date.
          </p>
        )}
        {subscription?.refreshFailed && (
          <p className="small muted">
            The last refresh could not finish. Confirmed access is preserved
            within its verified period. Try refreshing again.
          </p>
        )}
        <div className="billing-actions">
          {subscription?.manageUrl && (
            <Button asChild variant="outline">
              <a
                href={subscription.manageUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Manage subscription <ExternalLink size={14} />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </Button>
          )}
          <Button
            variant="outline"
            disabled={!!busy}
            onClick={() => void action({ action: "refresh" }, "refresh")}
          >
            {busy === "refresh" && <LoadingSpinner size={14} />}Refresh
            subscription status
          </Button>
          {data.linkingAvailable && (
            <Button
              variant="ghost"
              disabled={!!busy}
              onClick={() => void action({ action: "link" }, "link")}
            >
              {busy === "link" && <LoadingSpinner size={14} />}Connect an
              existing subscription
            </Button>
          )}
        </div>
      </section>
      {data.plan === "Free" && data.usage > 1 && (
        <section className="panel billing-selection">
          <h2>
            {data.needsSelection
              ? "Choose your Free account"
              : "Your Free account"}
          </h2>
          <p>
            {data.needsSelection
              ? "Pick one trading account for ongoing Free use. All other accounts stay available to read and export."
              : "Your choice stays fixed. Pro restores activity across all retained accounts. If you permanently delete your selected account, you can choose a replacement."}
          </p>
          <div>
            {data.accounts.map((a) => (
              <div className="billing-account" key={a.id}>
                <span>
                  <strong>{a.name}</strong>
                  <small>
                    {a.archived ? "Archived · " : ""}
                    {a.id === data.freeAccountId
                      ? "Selected for Free use"
                      : "Read and export access"}
                  </small>
                </span>
                {a.id === data.freeAccountId ? (
                  <Check size={18} aria-label="Selected" />
                ) : data.needsSelection ? (
                  <Button
                    variant="outline"
                    disabled={!!busy}
                    onClick={async () => {
                      if (
                        await confirmAction(
                          `Use ${a.name} as your Free account? This selection stays fixed unless the account is permanently deleted. Your other accounts remain available to read and export.`,
                        )
                      )
                        void action(
                          { action: "select", accountId: a.id },
                          a.id,
                        );
                    }}
                  >
                    Use this account
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
          <Link href="/prop-accounts" className="small">
            Manage or export your accounts →
          </Link>
        </section>
      )}
      <div className="billing-comparison">
        <section className="panel">
          <p className="eyebrow">A FOCUSED START</p>
          <h2>MSJournal Free</h2>
          <p>One trading account from one prop firm.</p>
          <ul>
            <li>
              <Check size={15} /> CSV imports and trade reviews
            </li>
            <li>
              <Check size={15} /> Analytics for your permitted account
            </li>
            <li>
              <Check size={15} /> Four free Book Companion worksheets
            </li>
          </ul>
        </section>
        <section className="panel billing-pro">
          <p className="eyebrow">ROOM FOR YOUR WHOLE PRACTICE</p>
          <h2>MSJournal Pro</h2>
          <p>Multiple accounts across prop firms.</p>
          <ul>
            <li>
              <Check size={15} /> Existing features across your accounts
            </li>
            <li>
              <Check size={15} /> Keep each account and its history together
            </li>
            <li>
              <Check size={15} /> Resume retained accounts without reimporting
            </li>
          </ul>
          {data.plan === "Pro" ? (
            <p className="positive small">
              Your plan includes multiple accounts.
            </p>
          ) : data.checkoutAvailable ? (
            data.plans.map((plan) => (
              <div className="billing-price-option" key={plan.interval}>
                <Button
                  disabled={!!busy}
                  onClick={() =>
                    void action(
                      { action: "checkout", option: plan.option },
                      `checkout-${plan.option}`,
                    )
                  }
                >
                  {busy === `checkout-${plan.option}` && (
                    <LoadingSpinner size={14} />
                  )}
                  Upgrade · {plan.title} · {plan.price}
                </Button>
                <p className="billing-price-detail">
                  {plan.interval === "annual"
                    ? annualSaving
                    : "Billed monthly in USD."}
                </p>
                {plan.interval === "annual" && (
                  <p className="billing-price-detail">{annualEquivalent}</p>
                )}
              </div>
            ))
          ) : (
            <div>
              <p className="billing-confirmed-price">
                {proPricing.monthly.price} <small>USD · billed monthly</small>
              </p>
              <p className="billing-unavailable">
                Pro checkout isn’t available yet. Your Free account and free
                worksheets remain available.
              </p>
            </div>
          )}
        </section>
      </div>
      <p className="small muted billing-footer-note">
        Payments and subscription changes are handled on Whop. MSJournal imports
        trades by CSV; it doesn’t automatically sync with a broker.{" "}
        <Link href="/book">Book Companion</Link> and{" "}
        <Link href="/books">Trading Books</Link> remain accessible.
      </p>
    </div>
  );
}
