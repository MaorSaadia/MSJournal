import type { Metadata } from "next";
import { PublicPageLink } from "@/components/public-page-link";
import { LegalPage } from "@/components/legal-page";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms for using the MSJournal trading journal and its subscriptions.",
  alternates: { canonical: absoluteUrl("/terms") },
};

export default function Terms() {
  return (
    <LegalPage title="Terms of Use">
      <p>These terms apply when you create an account or use MSJournal. See the <PublicPageLink href="/privacy">Privacy Policy</PublicPageLink> for how personal information is handled.</p>

      <h2>Using MSJournal</h2>
      <p>MSJournal is a journal for importing trading records, reviewing decisions, and tracking account progress. It does not execute trades, provide investment advice, or certify prop firm compliance. Confirm trading records, fees, and account rules with your broker or firm before relying on them for a decision.</p>

      <h2>Your account and content</h2>
      <p>Keep your sign-in credentials secure and only upload material you have permission to use. You retain ownership of your journal content and give MSJournal permission to store and process it to provide the features you use.</p>
      <p>Respect other users’ privacy and account boundaries. Do not misuse the service, interfere with its operation, or attempt to access another user’s workspace.</p>

      <h2>Plans, payments and cancellation</h2>
      <p>The Free plan supports one trading account. Pro supports multiple trading accounts. The checkout shows the applicable price, billing interval, and any taxes before you confirm. Whop processes payments and manages renewals. Use the link in Settings → Billing to manage or cancel a subscription in Whop. A cancellation at the end of the billing period preserves access through that period.</p>
      <p>If Pro ends, the Free account limit applies. Retained account history remains available to read or export under the app’s account-access rules. For a billing question, use <PublicPageLink href="/contact?topic=billing">billing support</PublicPageLink>.</p>

      <h2>Service changes and contact</h2>
      <p>Features may change or be temporarily unavailable. Keep your own copies of records you need. If you have questions about these terms, <PublicPageLink href="/contact">contact MSJournal</PublicPageLink>.</p>
    </LegalPage>
  );
}
