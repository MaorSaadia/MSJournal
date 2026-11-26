import type { Metadata } from "next";
import { PublicPageLink } from "@/components/public-page-link";
import { LegalPage } from "@/components/legal-page";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How MSJournal handles account, journal, billing, and support information.",
  alternates: { canonical: absoluteUrl("/privacy") },
};

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>This policy explains what MSJournal collects when you use the website and private trading journal, and how to contact us about your information.</p>

      <h2>Information you provide</h2>
      <p>We use your name and email to create and manage your account. If you choose a password, we store a password hash. We process the CSVs, journal notes, screenshots, trading account details, and other records you choose to save. If you contact support, we use your message, reply email, and any reference you include to handle your request.</p>

      <h2>Google sign-in</h2>
      <p>If you use Google to sign in, we receive your Google account identifier, email address, email verification status, and basic profile information such as your name and profile picture. We use that information to create or recognize your account and sign you in. We do not request access to Gmail or Google Drive or use Google account data for advertising.</p>
      <p>You can review or remove MSJournal’s access in <a href="https://myaccount.google.com/connections">your Google Account connections</a>. To ask about deleting information held by MSJournal, use our <PublicPageLink href="/contact?topic=access">account support form</PublicPageLink>.</p>

      <h2>Service providers and payments</h2>
      <p>Vercel hosts the website, Neon stores application data, and private object storage may hold images you upload. Resend delivers authentication and support emails when those features are used. Whop handles subscription checkout and payment details. MSJournal receives subscription and payment status information to manage plan access. Enter payment details only through Whop’s checkout.</p>

      <h2>Sessions, preferences and security</h2>
      <p>We use authentication cookies to keep you signed in and browser storage for preferences such as appearance. We process operational information to secure the service, limit abuse, and diagnose errors.</p>

      <h2>Affiliate referrals</h2>
      <p>If you visit through a Whop affiliate link, MSJournal stores the referral code in a browser cookie for up to 30 days and sends it to Whop when you start a new Pro checkout. Whop uses it to attribute eligible purchases.</p>

      <h2>Public website analytics</h2>
      <p>We use Cloudflare Web Analytics to measure traffic and performance on public pages. The analytics beacon is excluded from sign-in, billing, and the private journal.</p>

      <h2>Data requests</h2>
      <p>Use the available workspace controls to export or remove supported records. To request access, correction, or deletion of personal information, or to ask about retention, <PublicPageLink href="/contact">contact MSJournal</PublicPageLink>. We may need to verify your identity before acting on a request. Some records may need to be retained for security, billing, or legal obligations.</p>
    </LegalPage>
  );
}
