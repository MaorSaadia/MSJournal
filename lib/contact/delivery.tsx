import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { render } from "react-email";
import { Resend } from "resend";
import { z } from "zod";
import { readConfig } from "@/lib/config";
import { ReviewError } from "@/lib/reviews/model";
import { topics, type ContactSubmission } from "./model";
import { SupportNotification, VisitorConfirmation, confirmationCopy } from "./templates";
import { reserveSubmission, markAccepted } from "./reservations";

export async function deliverContact({ id, topic, email, message, receipt }: ContactSubmission, headers: Headers) {
  const config = readConfig();
  const inbox = z.email().safeParse(process.env.SUPPORT_INBOX_EMAIL?.trim());
  const missing = (["RESEND_API_KEY", "AUTH_EMAIL_FROM"] as const).filter(key => !config[key]?.trim());
  if (missing.length || !inbox.success) {
    console.warn("Contact delivery configuration incomplete", {
      settings: [...missing, ...(!inbox.success ? ["SUPPORT_INBOX_EMAIL"] : [])],
    });
    throw new ReviewError("Contact is temporarily unavailable. Your message is still here. Please try again later.", 503);
  }
  const created = Number(id.split(":")[0]);
  // Resend retains idempotency keys for 24 hours. Keep retries within that window.
  if (created > Date.now() + 5 * 60_000 || created < Date.now() - 23 * 60 * 60_000) {
    throw new ReviewError("This submission window has expired. Copy your message before opening a fresh Contact page.", 409);
  }
  const hash = (value: string) => createHmac("sha256", config.BETTER_AUTH_SECRET).update(value).digest("hex");
  const reference = `MSJ-${hash(`reference:${id}`).slice(0, 24).toUpperCase()}`;
  const ip = process.env.VERCEL === "1" ? headers.get("x-vercel-forwarded-for")?.trim() : undefined;
  const reservation = await reserveSubmission({
    id,
    fingerprint: hash(JSON.stringify([topic, email, message, receipt ?? ""])),
    emailKey: hash(`email:${email.toLowerCase()}`),
    networkKey: hash(`network:${ip && isIP(ip) ? ip : "unknown"}`),
  });
  if (reservation === "accepted") return { reference };
  if (reservation === "limited") throw new ReviewError("Too many requests. Please wait and try again later.", 429);
  if (reservation === "conflict") throw new ReviewError("This submission was already used. Please review your message and try again.", 409);

  const resend = new Resend(config.RESEND_API_KEY);
  const label = topics[topic].label;
  try {
    const result = await resend.emails.send({
      from: config.AUTH_EMAIL_FROM!, to: inbox.data, replyTo: email,
      subject: `[MSJournal Support] ${topics[topic].subject} · ${reference}`,
      html: await render(<SupportNotification reference={reference} topic={label} email={email} message={message} receipt={receipt} />),
      text: `MSJournal · New support message\nReference: ${reference}\nTopic: ${label}\nReply email: ${email}${receipt ? `\nWhop receipt or order ID: ${receipt}` : ""}\n\n${message}`,
    }, { idempotencyKey: `contact-support/${id}` });
    if (result.error || !result.data?.id) throw new Error("Provider did not confirm acceptance");
  } catch {
    console.warn("Contact notification unconfirmed", { reference });
    throw new ReviewError("We couldn’t confirm your message was sent. Your message is still here. Please retry.", 503);
  }

  console.info("Contact notification accepted", { reference });
  try {
    // Only the caller that marks acceptance sends the visitor confirmation.
    if (await markAccepted(id)) {
      const result = await resend.emails.send({
        from: config.AUTH_EMAIL_FROM!, to: email, replyTo: inbox.data,
        subject: `We received your MSJournal message · ${reference}`,
        html: await render(<VisitorConfirmation reference={reference} topic={label} />),
        text: `MSJournal\n\n${confirmationCopy}\n\nTopic: ${label}\nReference: ${reference}`,
      }, { idempotencyKey: `contact-confirmation/${id}` });
      console.info(result.error || !result.data?.id ? "Contact confirmation unconfirmed" : "Contact confirmation accepted", { reference });
    }
  } catch {
    console.warn("Contact follow-up unconfirmed", { reference });
  }
  return { reference };
}
