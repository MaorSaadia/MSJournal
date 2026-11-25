import { PublicPageLink } from "@/components/public-page-link";
import { ArrowUpRight, BookOpen, Check, Layers3 } from "lucide-react";
import { annualSaving, proPricing } from "@/lib/billing/pricing";

export function MarketingPricing() {
  return (
    <section id="pricing" className="marketing-section marketing-wrap marketing-pricing" aria-labelledby="pricing-title">
      <div className="marketing-section-heading" data-reveal>
        <h2 id="pricing-title">Plans and pricing</h2>
        <p>Start with one trading account. Upgrade when you need to track more.</p>
      </div>
      <div className="marketing-pricing-grid">
        <article className="marketing-plan" aria-labelledby="marketing-free" data-reveal>
          <div className="marketing-plan-heading">
            <BookOpen size={21} aria-hidden="true" />
            <h3 id="marketing-free">MSJournal Free</h3>
          </div>
          <div className="marketing-plan-rates">
            <p><strong>$0</strong> <span>forever</span></p>
          </div>
          <p className="marketing-plan-note">No subscription required.</p>
          <ul>
            <li><Check size={16} aria-hidden="true" />One trading account from one prop firm</li>
            <li><Check size={16} aria-hidden="true" />CSV imports, analytics and trade reviews</li>
            <li><Check size={16} aria-hidden="true" />Four free Book Companion worksheets</li>
          </ul>
          <PublicPageLink className="marketing-button marketing-free-button" href="/signup">
            Start free <ArrowUpRight size={17} aria-hidden="true" />
          </PublicPageLink>
        </article>
        <article className="marketing-plan marketing-plan-pro" aria-labelledby="marketing-pro" data-reveal>
          <div className="marketing-plan-heading">
            <Layers3 size={21} aria-hidden="true" />
            <h3 id="marketing-pro">MSJournal Pro</h3>
          </div>
          <div className="marketing-plan-rates">
            <p><strong>${proPricing.monthly.amount}</strong> <span>/ month</span></p>
            <p><strong>${proPricing.annual.amount}</strong> <span>/ year</span></p>
          </div>
          <p className="marketing-plan-note">{annualSaving}</p>
          <ul>
            <li><Check size={16} aria-hidden="true" />Multiple trading accounts across prop firms</li>
            <li><Check size={16} aria-hidden="true" />Analytics and trade reviews across your accounts</li>
            <li><Check size={16} aria-hidden="true" />Same Pro features with either billing option</li>
          </ul>
          <PublicPageLink className="marketing-button" href="/signup?next=%2Fsettings%2Fbilling">
            Get Pro <ArrowUpRight size={17} aria-hidden="true" />
          </PublicPageLink>
        </article>
      </div>
      <p className="marketing-pricing-terms">Prices in USD. Taxes may apply.</p>
    </section>
  );
}
