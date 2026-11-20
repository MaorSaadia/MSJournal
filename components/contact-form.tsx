"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading";
import { messageLimit, topics, type ContactTopic } from "@/lib/contact/model";

export function ContactForm({ initialTopic, initialEmail }: { initialTopic: ContactTopic | ""; initialEmail: string }) {
  const [topic, setTopic] = useState(initialTopic);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const inFlight = useRef(false);
  const attempt = useRef<{ body: string; id: string } | null>(null);
  const success = useRef<HTMLDivElement>(null);
  useEffect(() => { if (reference) success.current?.focus(); }, [reference]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || reference) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const payload = JSON.stringify(fields);
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      if (attempt.current?.body !== payload) attempt.current = { body: payload, id: `${Date.now()}:${crypto.randomUUID()}` };
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, id: attempt.current.id }),
      });
      const result = await response.json();
      if (!response.ok || typeof result.reference !== "string") {
        setError(result.message ?? "We couldn’t confirm your message was sent. Please retry.");
        return;
      }
      setReference(result.reference);
    } catch {
      setError("We couldn’t confirm your message was sent. Please retry.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  if (reference) return <div className="contact-success" role="status" tabIndex={-1} ref={success}>
    <CheckCircle2 size={24} aria-hidden="true" />
    <h2>Message sent</h2>
    <p>Keep this reference for your records.</p>
    <strong>{reference}</strong>
  </div>;

  return <form method="post" onSubmit={submit} aria-busy={pending}>
    <fieldset className="contact-fields" disabled={pending}>
      <label className="form-field">Topic
        <select name="topic" required value={topic} onChange={(event) => setTopic(event.target.value as ContactTopic | "")}>
          <option value="">Choose a topic</option>
          {Object.entries(topics).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
        </select>
      </label>
      <label className="form-field">Reply email
        <input name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={initialEmail} />
      </label>
      {topic === "billing" && <label className="form-field">Whop receipt or order ID (optional)
        <input name="receipt" maxLength={120} autoComplete="off" />
      </label>}
      <label className="form-field">Message
        <textarea name="message" required maxLength={messageLimit} rows={6} aria-describedby="contact-hint" />
        <small id="contact-hint">{topic ? topics[topic].hint : "Choose a topic to see a suggested prompt."} {topic === "billing" && "Please leave out card details and passwords."}</small>
      </label>
      <div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button type="submit" className="contact-submit">
        {pending && <LoadingSpinner size={16} />}
        {pending ? "Sending…" : error ? "Retry sending" : "Send message"}
      </Button>
    </fieldset>
  </form>;
}
