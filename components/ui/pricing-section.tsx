"use client";

import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, BookOpen, Check, Layers3, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading";
import { annualEquivalent, annualSaving, proPricing, type ProInterval, type VerifiedPlanOption } from "@/lib/billing/pricing";

type Props = {
  currentPlan: "Free" | "Pro";
  plans: VerifiedPlanOption[];
  checkoutAvailable: boolean;
  checkoutError: string;
  busy: string;
  manageUrl?: string | null;
  onCheckout: (option: number) => void;
  currentInterval?: ProInterval | null;
  changeState?: string;
  onChangeAnnual?: () => void;
};

export default function PricingSection({ currentPlan, plans, checkoutAvailable, checkoutError, busy, manageUrl, onCheckout, currentInterval, changeState, onChangeAnnual }: Props) {
  const [interval, setInterval] = useState<ProInterval>(
    changeState && ["checkout", "awaiting_payment", "cancel_pending"].includes(changeState) ? "annual" : currentInterval ?? "monthly",
  );
  const switchId = useId();
  const reducedMotion = useReducedMotion();
  const yearlyAvailable = plans.some((p) => p.interval === "annual");
  // A refreshed configuration can withdraw an option; never retain a stale price or CTA.
  const selectedInterval = interval === "annual" && yearlyAvailable ? "annual" : "monthly";
  const selected = plans.find((p) => p.interval === selectedInterval);
  const price = proPricing[selectedInterval];
  const pro = currentPlan === "Pro";

  return (
    <section className="billing-pricing" aria-labelledby="billing-pricing-title">
      <header className="billing-pricing-intro">
        <span className="billing-kicker">YOUR JOURNAL, YOUR PACE</span>
        <h2 id="billing-pricing-title">Make room for <span>your trading.</span></h2>
        <p>Start with one account. Bring your whole practice together with Pro.</p>
        {yearlyAvailable && (
          <div className="billing-period-switch" role="group" aria-label="Pro billing period">
            {(["monthly", "annual"] as const).map((value) => (
              <button type="button" key={value} aria-pressed={selectedInterval === value} onClick={() => setInterval(value)}>
                {selectedInterval === value && (
                  <motion.span className="billing-period-active" layoutId={switchId} transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }} />
                )}
                <span>{value === "monthly" ? "Monthly" : "Yearly"}</span>
                {value === "annual" && <small>Save 25%</small>}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="billing-comparison billing-pricing-grid">
        <section className="panel billing-tier billing-tier-free" aria-labelledby="free-plan-title">
          <div className="billing-tier-top"><span className="billing-tier-icon"><BookOpen size={20} /></span><span className="billing-tier-label">A FOCUSED START</span></div>
          <h3 id="free-plan-title">MSJournal Free</h3>
          <p className="billing-tier-description">Build a review habit with one trading account.</p>
          <div className="billing-tier-price"><strong>$0</strong><span>/ forever</span></div>
          <p className="billing-tier-price-note">No subscription required.</p>
          <Button variant="outline" disabled className="billing-tier-cta">{pro ? "Free essentials included" : "Your current plan"}</Button>
          <div className="billing-tier-divider" />
          <p className="billing-feature-title">Everything you need to begin</p>
          <ul>
            <li><Check size={16} />One trading account from one prop firm</li>
            <li><Check size={16} />CSV imports and performance analytics</li>
            <li><Check size={16} />Trade reviews, notes and screenshots</li>
            <li><Check size={16} />Four free Book Companion worksheets</li>
          </ul>
        </section>

        <section className="panel billing-pro billing-tier" aria-labelledby="pro-plan-title">
          <div className="billing-tier-top"><span className="billing-tier-icon"><Layers3 size={20} /></span><span className="billing-tier-label">ROOM TO GROW</span><span className="billing-pro-badge"><Sparkles size={12} />{pro ? "Your plan" : "More accounts"}</span></div>
          <h3 id="pro-plan-title">MSJournal Pro</h3>
          <p className="billing-tier-description">One workspace for multiple accounts and prop firms.</p>
          <div className="billing-tier-price" aria-label={price.price}><strong>${price.amount}</strong><span>/ {selectedInterval === "annual" ? "year" : "month"}</span></div>
          <p className="billing-tier-price-note">{selectedInterval === "annual" ? annualEquivalent : "Billed monthly in USD. Taxes may apply."}</p>
          {pro && selectedInterval === "annual" && currentInterval === "monthly" && selected && checkoutAvailable && onChangeAnnual ? (
            <Button className="billing-tier-cta" disabled={!!busy || changeState === "cancel_pending"} onClick={onChangeAnnual}>
              {busy === "switch_annual" ? <><LoadingSpinner size={15} />Opening yearly checkout</> : changeState === "cancel_pending" ? "Finishing your billing change" : <>{changeState === "awaiting_payment" ? "Continue yearly checkout" : "Change to yearly"}<ArrowUpRight size={16} /></>}
            </Button>
          ) : pro ? (
            manageUrl ? <Button asChild className="billing-tier-cta"><a href={manageUrl} target="_blank" rel="noopener noreferrer">Manage subscription<ArrowUpRight size={16} /><span className="sr-only"> (opens in a new tab)</span></a></Button>
              : <Button disabled className="billing-tier-cta"><Check size={16} />Your Pro plan is active</Button>
          ) : (
            <>
              <Button className="billing-tier-cta" disabled={!!busy} onClick={() => onCheckout(price.option)}>
                {busy === `checkout-${price.option}` ? <><LoadingSpinner size={15} />Checking checkout</> : <>Get Pro {selectedInterval === "annual" ? "Yearly" : "Monthly"}<ArrowUpRight size={16} /></>}
              </Button>
              {checkoutError && <p className="form-error" role="alert">{checkoutError}</p>}
            </>
          )}
          {selectedInterval === "annual" && <p className="billing-annual-saving">{annualSaving}</p>}
          {pro && currentInterval && <p className="billing-current-period">Your current billing period: {currentInterval === "annual" ? "Yearly" : "Monthly"}.</p>}
          <div className="billing-tier-divider" />
          <p className="billing-feature-title">Everything in Free, across your accounts</p>
          <ul>
            <li><Check size={16} />Multiple trading accounts across prop firms</li>
            <li><Check size={16} />Analytics and reviews across your accounts</li>
            <li><Check size={16} />Keep each account and its history together</li>
            <li><Check size={16} />Resume retained accounts without reimporting</li>
          </ul>
          <p className="billing-tier-footnote"><ShieldCheck size={14} />{pro ? "Payments are confirmed through Whop." : "Secure checkout through Whop. Cancel future renewals anytime."}</p>
        </section>
      </div>
      {yearlyAvailable && <p className="billing-schedule-note">Monthly or yearly. The same Pro features, on your schedule. Prices in USD; taxes may apply.</p>}
    </section>
  );
}
