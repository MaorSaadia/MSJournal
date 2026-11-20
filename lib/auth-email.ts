import { Resend } from "resend";
import { emailConfigured, readConfig } from "./config";
export class EmailDeliveryError extends Error {
  constructor() {
    super("Email recovery is temporarily unavailable. Please try again later.");
  }
}
export async function sendAuthEmail(
  to: string,
  url: string,
  kind: "reset" | "verify",
) {
  const config = readConfig();
  if (!emailConfigured(config)) throw new EmailDeliveryError();
  const title =
    kind === "reset"
      ? "Reset your MSJournal password"
      : "Verify your MSJournal email";
  let safeUrl: string;
  try {
    const destination = new URL(url);
    if (destination.origin !== new URL(config.BETTER_AUTH_URL).origin || destination.username || destination.password)
      throw new EmailDeliveryError();
    safeUrl = destination.toString();
  } catch { throw new EmailDeliveryError(); }
  const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]!);
  const action = kind === "reset" ? "Reset password" : "Verify email";
  const description = kind === "reset"
    ? "We received a request to reset your MSJournal password. Choose a new password using the secure link below."
    : "Confirm your email address to continue to your MSJournal workspace.";
  try {
    const { data, error } = await new Resend(config.RESEND_API_KEY).emails.send(
      {
        from: config.AUTH_EMAIL_FROM!,
        to,
        subject: title,
        text: `${title}\n\n${description}\n\n${safeUrl}\n\nThis link expires in one hour. If you did not request this, ignore this email.${kind === "reset" ? " Your password will not change unless you complete the reset." : ""}`,
        html: `<div style="background:#f5f7f9;padding:32px 16px;font-family:Arial,sans-serif;color:#18242d"><div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e0e6ea;border-radius:16px;padding:32px"><p style="color:#00856b;font-weight:bold;font-size:20px">MSJournal</p><h1 style="font-size:24px">${title}</h1><p style="line-height:1.7;color:#536471">${description}</p><p style="margin:28px 0"><a href="${escape(safeUrl)}" style="display:inline-block;padding:14px 24px;border-radius:8px;background:#00856b;color:#fff;text-decoration:none;font-weight:bold">${action}</a></p><p style="font-size:13px;line-height:1.7;color:#536471">This link expires in one hour. If you did not request this email, you can ignore it.${kind === "reset" ? " Your password will not change unless you complete the reset." : ""}</p><p style="font-size:12px;line-height:1.7;color:#536471">Button not working? Copy this link into your browser:<br><a href="${escape(safeUrl)}" style="color:#00856b;word-break:break-all">${escape(safeUrl)}</a></p></div></div>`,
      },
    );
    if (error || !data?.id) throw new EmailDeliveryError();
  } catch {
    throw new EmailDeliveryError();
  }
}
