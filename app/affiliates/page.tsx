import type { Metadata } from "next";
import { ArrowUpRight, ChartNoAxesCombined, Link2, UserRoundPlus } from "lucide-react";
import { BrandLink } from "@/components/brand-link";
import { LandingMotion } from "@/components/marketing/motion";
import { PublicPageLink } from "@/components/public-page-link";
import { PublicWebAnalytics } from "@/components/public-web-analytics";
import { ThemeControl } from "@/components/shell";
import { affiliateCommissionRate, affiliateJoinUrl } from "@/lib/affiliates";
import { absoluteUrl, indexableDeployment, noIndex } from "@/lib/seo";
import "./affiliates.css";

const rate = `${affiliateCommissionRate}%`;
const description = `Share MSJournal with other traders and earn a ${rate} commission on eligible Pro subscription payments made through your personal referral link.`;

export const metadata: Metadata = {
  title: "Affiliate Program",
  description,
  alternates: { canonical: absoluteUrl("/affiliates") },
  robots: indexableDeployment ? { index: true, follow: true } : noIndex,
};

const steps = [
  { icon: UserRoundPlus, title: "Join on Whop", text: "Enroll in the MSJournal affiliate program and get your own referral link." },
  { icon: Link2, title: "Share your link", text: "Show other traders how you use MSJournal and include your personal referral link." },
  { icon: ChartNoAxesCombined, title: "Track your earnings", text: "See credited referrals and earnings in Whop, where commissions and payouts are managed." },
];

export default function AffiliatesPage() {
  const joinUrl = affiliateJoinUrl();

  return (
    <div className="marketing affiliate-page">
      <PublicWebAnalytics enabled={indexableDeployment} />
      <a className="marketing-skip" href="#affiliate-main">Skip to content</a>
      <header className="affiliate-header">
        <div className="marketing-wrap">
          <BrandLink className="marketing-brand" documentNavigation />
          <div><PublicPageLink href="/">MSJournal home</PublicPageLink><ThemeControl /></div>
        </div>
      </header>
      <LandingMotion>
        <main id="affiliate-main" className="marketing-wrap">
          <section className="affiliate-hero" aria-labelledby="affiliate-title">
            <p className="marketing-kicker" data-enter>MSJournal Affiliate Program</p>
            <h1 id="affiliate-title" data-enter>Recommend MSJournal. <em>Earn {rate}.</em></h1>
            <p className="affiliate-description" data-enter>{description}</p>
            <div className="affiliate-join" data-enter>
              {joinUrl ? (
                <a className="marketing-button" href={joinUrl}>
                  Become an affiliate <ArrowUpRight size={17} aria-hidden="true" />
                </a>
              ) : (
                <><p>Affiliate enrollment opens soon</p><PublicPageLink href="/contact?topic=affiliate">Contact us about the program</PublicPageLink></>
              )}
              <p className="affiliate-eligibility">Free signups do not earn a commission.</p>
            </div>
          </section>
          <section className="affiliate-how" aria-labelledby="affiliate-how-title" data-reveal>
            <h2 id="affiliate-how-title">How it works</h2>
            <ol>
              {steps.map(({ icon: Icon, title, text }) => (
                <li key={title}><Icon size={23} aria-hidden="true" /><h3>{title}</h3><p>{text}</p></li>
              ))}
            </ol>
          </section>
        </main>
      </LandingMotion>
      <footer className="marketing-wrap marketing-footer">
        <nav aria-label="Footer navigation">
          <PublicPageLink href="/#pricing">Pricing</PublicPageLink>
          <PublicPageLink href="/terms">Terms of Use</PublicPageLink>
          <PublicPageLink href="/privacy">Privacy Policy</PublicPageLink>
          <PublicPageLink href="/contact">Contact us</PublicPageLink>
        </nav>
      </footer>
    </div>
  );
}
