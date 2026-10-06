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
  try {
    const { data, error } = await new Resend(config.RESEND_API_KEY).emails.send(
      {
        from: config.AUTH_EMAIL_FROM!,
        to,
        subject: title,
        text: `${title}\n\n${url}\n\nThis link expires in one hour. If you did not request this, ignore this email.`,
      },
    );
    if (error || !data?.id) throw new EmailDeliveryError();
  } catch {
    throw new EmailDeliveryError();
  }
}
