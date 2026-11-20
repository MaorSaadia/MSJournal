import Link from "next/link";
import { headers } from "next/headers";
import { ThemeControl } from "@/components/shell";
import { userSession } from "@/lib/session";
import { topicSchema } from "@/lib/contact/model";
import { ContactForm } from "@/components/contact-form";
import "./contact.css";

export const metadata = { title: "Contact us" };

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const session = await userSession(await headers()).catch(() => null);
  const topic = topicSchema.safeParse((await searchParams).topic);
  return <div className="login-page contact-page">
    <header className="login-header">
      <Link href="/" className="brand-name" aria-label="MSJournal home">MS<span>Journal</span></Link>
      <ThemeControl />
    </header>
    <main className="panel contact-card">
      <h1>How can we help?</h1>
      <p className="contact-intro muted">Suggest a feature, report a problem, or ask us about your MSJournal account.</p>
      <ContactForm key={topic.success ? topic.data : "contact"} initialTopic={topic.success ? topic.data : ""} initialEmail={session?.user.email ?? ""} />
    </main>
  </div>;
}
