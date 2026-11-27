import { DEFAULT_JOURNAL_TIMEZONE } from "@/lib/timezones";
import { PublicWebAnalytics } from "@/components/public-web-analytics";
import { indexableDeployment } from "@/lib/seo";
import Link from "next/link";
import { PublicPageLink } from "@/components/public-page-link";
import { headers } from "next/headers";
import { ThemeControl } from "@/components/shell";
import { userSession } from "@/lib/session";
import { topicSchema } from "@/lib/contact/model";
import { ContactForm } from "@/components/contact-form";
import { WorkspaceFrame } from "@/components/workspace-layout";
import { getPreferences } from "@/lib/preferences";
import { LifeBuoy, LockKeyhole, MessageSquareText } from "lucide-react";
import "./contact.css";

export const metadata = { title: "Contact us" };

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const requestHeaders = await headers();
  const [session, params] = await Promise.all([userSession(requestHeaders).catch(() => null), searchParams]);
  const topic = topicSchema.safeParse(params.topic);
  const preferences = session ? await getPreferences(requestHeaders).catch(() => null) : null;
  const PageLink = session ? Link : PublicPageLink;
  const content = (
    <div className={`contact-workspace${session ? " contact-signed-in" : ""}`}>
      <header className="contact-hero">
        <div className="contact-hero-content">
          <span className="contact-icon"><LifeBuoy size={22} aria-hidden="true" /></span>
          <h1>How can we help?</h1>
          <p>Suggest a feature, report a problem, or ask us about your MSJournal account.</p>
        </div>
      </header>
      <div className="contact-grid">
        <section className="panel contact-card" aria-labelledby="contact-form-title">
          <div className="contact-card-heading">
            <MessageSquareText size={19} aria-hidden="true" />
            <h2 id="contact-form-title">Send us a message</h2>
          </div>
          <ContactForm key={topic.success ? topic.data : "contact"} initialTopic={topic.success ? topic.data : ""} initialEmail={session?.user.email ?? ""} />
        </section>
        <aside className="contact-guide" aria-label="Quick help">
          <section className="panel contact-tip">
            <LockKeyhole size={19} aria-hidden="true" />
            <h2>Trouble signing in?</h2>
            <p>Request a reset link if you’ve forgotten your password.</p>
            <PageLink href="/forgot-password">Reset your password</PageLink>
          </section>
          <section className="panel contact-tip">
            <MessageSquareText size={19} aria-hidden="true" />
            <h2>Reporting a problem?</h2>
            <p>Tell us which page you were on, what you expected, and what happened. If you saw an error, include its text.</p>
          </section>
        </aside>
      </div>
    </div>
  );
  if (session) return <WorkspaceFrame owner={session.user} preferences={preferences ?? { displayTimezone: DEFAULT_JOURNAL_TIMEZONE, weekStartsOn: 0 }}>{content}</WorkspaceFrame>;
  return <div className="login-page contact-page">
    <PublicWebAnalytics enabled={indexableDeployment} />
    <header className="login-header">
      <PublicPageLink href="/" className="brand-name" aria-label="MSJournal home">MS<span>Journal</span></PublicPageLink>
      <ThemeControl />
    </header>
    <main>{content}</main>
  </div>;
}
