import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, CalendarDays, ChartNoAxesCombined, FileUp, NotebookPen, ShieldCheck, WalletCards } from "lucide-react";
import { absoluteUrl, serializeJsonLd, siteDescription } from "@/lib/seo";
import { ThemeControl } from "@/components/shell";

const features = [
  { id: "import", icon: FileUp, title: "From CSV to a clearer record", text: "Upload your Tradovate Performance CSV, choose its destination account and source timezone, and review before importing. Add broker-reported fees to distinguish gross results from net P&L." },
  { id: "analytics", icon: ChartNoAxesCombined, title: "See the patterns behind your P&L", text: "Explore win rate, profit factor, daily results and cumulative P&L. Filter by account and date, then use reports to examine the habits behind your trading." },
  { id: "calendar", icon: CalendarDays, title: "Put every trading day in context", text: "Browse your trading calendar and open a day to review its results. Keep preparation, observations and daily reflections alongside your trading activity." },
  { id: "review", icon: NotebookPen, title: "Keep the lesson with the trade", text: "Review entries and trade management, attach private chart screenshots, and record emotions, mistakes and strategy assignments. Build a journal you can return to." },
  { id: "prop-accounts", icon: WalletCards, title: "Track the account, not just the trade", text: "Configure evaluation or funded account rules, follow profit targets and supported loss-buffer estimates, and record payout events. Progress follows your saved rules and available history; firm confirmation remains separate." },
  { id: "privacy", icon: ShieldCheck, title: "A workspace for your own records", text: "Your journal, screenshots and account details require sign-in. Keep accounts separate, manage fees, and download a data archive from Settings." },
];

export function Landing() {
  const schema = { "@context": "https://schema.org", "@graph": [
    { "@type": "WebSite", "@id": absoluteUrl("/#website"), name: "MSJournal", url: absoluteUrl("/"), inLanguage: "en" },
    { "@type": "SoftwareApplication", name: "MSJournal", url: absoluteUrl("/"), applicationCategory: "FinanceApplication", operatingSystem: "Web", description: siteDescription },
  ] };
  return (
    <div className="marketing">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <a className="marketing-skip" href="#main">Skip to content</a>
      <header className="marketing-nav">
        <Link className="marketing-brand" href="/" aria-label="MSJournal home"><Image src="/icon.svg" width={34} height={34} alt="" /><span>MSJournal</span></Link>
        <nav aria-label="Main navigation"><a href="#features">Features</a><a href="#get-started">Get started</a><ThemeControl /><Link href="/login">Sign in</Link><Link className="marketing-button compact" href="/signup">Create account <ArrowUpRight size={15} aria-hidden /></Link></nav>
      </header>
      <main id="main">
        <section className="marketing-hero">
          <p className="marketing-kicker"><span /> YOUR TRADES, IN PERSPECTIVE</p>
          <h1>Your trades. Your habits.<br /><em>A clearer picture.</em></h1>
          <p className="marketing-lead">A futures trading journal that brings your results, chart screenshots and reflections together. See what happened. Understand how you traded.</p>
          <div className="marketing-actions"><Link className="marketing-button" href="/signup">Start your journal <ArrowRight size={18} aria-hidden /></Link><a href="#features">Explore MSJournal <ArrowRight size={16} aria-hidden /></a></div>
          <p className="marketing-fine">Tradovate Performance CSV imports · Analytics · Trade reviews · Prop account tracking</p>
          <div className="marketing-workflow" aria-label="Your journaling workflow">
            <div><span>01 / IMPORT</span><FileUp size={26} aria-hidden /><strong>Your trading record</strong><p>Bring your Performance CSV.</p></div>
            <div><span>02 / UNDERSTAND</span><ChartNoAxesCombined size={26} aria-hidden /><strong>Your performance, in context</strong><p>Explore results across accounts and days.</p></div>
            <div><span>03 / REFLECT</span><NotebookPen size={26} aria-hidden /><strong>Your next useful insight</strong><p>Keep screenshots, notes and lessons together.</p></div>
          </div>
        </section>
        <section id="features" className="marketing-section">
          <p className="marketing-kicker">BUILT AROUND YOUR REVIEW</p><h2>More context for every decision.</h2>
          <p className="marketing-section-intro">MSJournal connects imported futures trading activity with the work you do before and after a trade.</p>
          <div className="marketing-feature-grid">{features.map(({ id, icon: Icon, title, text }) => <article id={id} key={id}><Icon size={22} aria-hidden /><h3>{title}</h3><p>{text}</p></article>)}</div>
        </section>
        <section id="get-started" className="marketing-section marketing-start">
          <div><p className="marketing-kicker">A SIMPLE PLACE TO START</p><h2>Bring your trades.<br />Build your review habit.</h2><Link className="marketing-button" href="/signup">Create your account <ArrowRight size={18} aria-hidden /></Link></div>
          <ol><li><strong>Create an account</strong><p>Set up your private workspace and add a trading account.</p></li><li><strong>Import a Performance CSV</strong><p>Export from Tradovate, confirm the account and timezone, and review your file. Enter fees when known; missing fees stay explicit.</p></li><li><strong>Explore, then reflect</strong><p>Open your calendar and analytics, review a trade, and add a screenshot or a note. Configure prop account rules if relevant.</p></li></ol>
        </section>
        <section className="marketing-section marketing-faq" aria-labelledby="faq-title"><h2 id="faq-title">Before you begin</h2>
          <details><summary>Does MSJournal connect to my broker automatically?</summary><p>Importing is CSV based. MSJournal does not automatically synchronize with your broker or place trades.</p></details>
          <details><summary>Can it verify that I passed a prop firm evaluation?</summary><p>It tracks progress against configured rules and recorded activity. CSVs do not establish a complete intraday equity history or official compliance. Confirm rules and account status on your firm’s website.</p></details>
          <details><summary>Are net results available without fees?</summary><p>Net P&L needs fees. You can enter report totals or configure explicit estimates. Missing fees are not assumed to be zero, and estimated or incomplete results are labeled.</p></details>
        </section>
      </main>
      <footer className="marketing-footer"><Link className="marketing-brand" href="/">MSJournal</Link><p>The trader’s perspective.</p><nav aria-label="Footer navigation"><a href="#features">Features</a><a href="#get-started">Getting started</a><Link href="/login">Sign in</Link></nav><small>Independent journal software. No official affiliation with Tradovate or any prop firm. Trading outcomes are not guaranteed.</small></footer>
    </div>
  );
}
