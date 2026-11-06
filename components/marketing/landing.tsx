import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, BookOpen, Check, FileUp, LockKeyhole, NotebookPen, ShieldCheck } from "lucide-react";
import { absoluteUrl, serializeJsonLd, siteDescription } from "@/lib/seo";
import { LandingMotion } from "./motion";
import { MarketingNavigation } from "./navigation";
import { ProductShowcase } from "./showcase";
import { FeatureStories } from "./feature-stories";

export function Landing(){
  const schema={"@context":"https://schema.org","@graph":[{"@type":"WebSite","@id":absoluteUrl("/#website"),name:"MSJournal",url:absoluteUrl("/"),inLanguage:"en"},{"@type":"SoftwareApplication",name:"MSJournal",url:absoluteUrl("/"),applicationCategory:"FinanceApplication",operatingSystem:"Web",description:siteDescription}]};
  return <div className="marketing">
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd(schema)}}/>
    <a className="marketing-skip" href="#main">Skip to content</a>
    <header className="marketing-nav"><div className="marketing-nav-inner"><Link className="marketing-brand" href="/" aria-label="MSJournal home"><Image src="/icon.svg" width={32} height={32} alt=""/><span>MSJournal<span className="marketing-brand-dot">.</span></span></Link><MarketingNavigation/></div></header>
    <LandingMotion><main id="main">
      <section className="marketing-hero marketing-wrap">
        <p className="marketing-kicker" data-enter><span className="marketing-status-dot"/> THE TRADER’S PERSPECTIVE</p>
        <h1 data-enter>Your trades. Your habits.<br/><em>A clearer picture.</em></h1>
        <p className="marketing-lead" data-enter>A futures trading journal for the work behind your results.<br className="marketing-desktop-break"/> Connect your performance, your decisions and your next useful insight.</p>
        <div className="marketing-actions" data-enter><Link className="marketing-button" href="/signup">Start your journal <ArrowUpRight size={18} aria-hidden="true"/></Link><a className="marketing-text-button" href="#workspace">Explore the workspace <ArrowRight size={17} aria-hidden="true"/></a></div>
        <div className="marketing-hero-assurance" data-enter><span><Check size={13} aria-hidden="true"/> Tradovate CSV imports</span><span><Check size={13} aria-hidden="true"/> Fees-aware analytics</span><span><LockKeyhole size={12} aria-hidden="true"/> Your private workspace</span></div>
      </section>
      <div className="marketing-wrap marketing-showcase-wrap"><ProductShowcase/></div>
      <section id="features" className="marketing-section marketing-wrap">
        <div className="marketing-section-heading" data-reveal><p className="marketing-kicker">LESS SCATTER. MORE PERSPECTIVE.</p><h2>Not just a record.<br/><span>A place to understand it.</span></h2><p>Your results tell one part of the story. Bring the decisions, charts and reflections into the same picture.</p></div>
        <FeatureStories/><p className="marketing-demo-caption">Product previews use illustrative demo data.</p>
      </section>
      <section id="get-started" className="marketing-section marketing-how"><div className="marketing-wrap"><div className="marketing-section-heading" data-reveal><p className="marketing-kicker">A SIMPLE PLACE TO START</p><h2>Bring your trades.<br/><span>Build your review habit.</span></h2></div><ol className="marketing-steps"><li data-reveal><span className="marketing-step-number">01</span><ShieldCheck size={23} aria-hidden="true"/><h3>Make it your workspace.</h3><p>Create an account and add your trading account. Keep your records together and your accounts distinct.</p></li><li data-reveal><span className="marketing-step-number">02</span><FileUp size={23} aria-hidden="true"/><h3>From CSV to a clearer record.</h3><p>Import your Tradovate Performance CSV. Confirm the account and timezone, then add broker-reported fees when known.</p></li><li data-reveal><span className="marketing-step-number">03</span><NotebookPen size={23} aria-hidden="true"/><h3>Find your next useful insight.</h3><p>Explore your results, review a trade and keep a screenshot or a lesson. Return to the decisions that matter.</p></li></ol></div></section>
      <section className="marketing-wrap marketing-book-wrap" data-reveal><div className="marketing-book"><div className="marketing-book-mark" aria-hidden="true"><BookOpen size={34} strokeWidth={1.3}/></div><div><p className="marketing-kicker">A LITTLE STRUCTURE FOR YOUR PRACTICE</p><h2>Put the plan into your own words.</h2><p>Four free worksheets from <em>The Consistent Day Trader</em>. Build a plan, prepare for a session, reset after a difficult moment, or review one pattern.</p></div><Link href="/book">Explore the Book Companion <ArrowUpRight size={17} aria-hidden="true"/></Link></div></section>
      <section className="marketing-section marketing-wrap marketing-faq" aria-labelledby="faq-title"><div data-reveal><p className="marketing-kicker">A FEW THINGS TO KNOW</p><h2 id="faq-title">Clarity starts here.</h2><p>Understand what the journal does<br/>before you make it part of your routine.</p></div><div className="marketing-faq-list" data-reveal><details><summary>Does MSJournal connect to my broker automatically?</summary><p>Importing is CSV based. MSJournal does not automatically synchronize with your broker or place trades.</p></details><details><summary>Can it verify that I passed a prop firm evaluation?</summary><p>It tracks progress against configured rules and recorded activity. CSVs do not establish a complete intraday equity history or official compliance. Confirm rules and account status on your firm’s website.</p></details><details><summary>Are net results available without fees?</summary><p>Net P&L needs fees. You can enter report totals or configure explicit estimates. Missing fees are not assumed to be zero, and estimated or incomplete results are labeled.</p></details></div></section>
      <section className="marketing-final marketing-wrap" data-reveal><span className="marketing-final-rule"/><p className="marketing-kicker">YOUR NEXT CHAPTER STARTS WITH A CLEARER RECORD</p><h2>Trade. Reflect.<br/><em>Find your perspective.</em></h2><p>Give your trading decisions a place to become useful lessons.</p><Link className="marketing-button" href="/signup">Create your account <ArrowUpRight size={18} aria-hidden="true"/></Link></section>
    </main></LandingMotion>
    <footer className="marketing-footer marketing-wrap"><div><Link className="marketing-brand" href="/">MSJournal<span className="marketing-brand-dot">.</span></Link><p>The trader’s perspective.</p></div><nav aria-label="Footer navigation"><a href="#features">Features</a><Link href="/book">Book Companion</Link><Link href="/login">Sign in</Link></nav><small>Independent journal software. No official affiliation with Tradovate or any prop firm. Trading outcomes are not guaranteed.</small></footer>
  </div>;
}
