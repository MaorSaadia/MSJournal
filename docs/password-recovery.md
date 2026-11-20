# Password recovery

Existing Better Auth recovery uses single-use library reset tokens, a one-hour expiry and session revocation after a successful reset. Request responses do not disclose account existence. Existing origin checks and request rate limits remain enabled. Reset tokens stay in component memory and are removed from browser history.

Configure RESEND_API_KEY and AUTH_EMAIL_FROM server-side. Verify msjournal.app as a sending domain in Resend, add the provided SPF/DKIM DNS records, and create a sending-only key scoped to that domain. Set AUTH_EMAIL_FROM to MSJournal <auth@msjournal.app> only after verification. Production BETTER_AUTH_URL must be https://www.msjournal.app. Add values in Vercel Production and redeploy; local development uses .env.local and a restarted dev server. Never expose the key with NEXT_PUBLIC or in chat.

Recovery now has a branded HTML email with plaintext fallback, safe link escaping and an exact configured-origin check. The UI has clearer unavailable messaging and lets users retry with the email preserved. No reset messages were sent during development; Resend is mocked in checks. Final live acceptance requires requesting a link from Forgot password, checking email delivery/spam, resetting, verifying the old password no longer works and token replay fails. Do not log tokens, passwords or email provider payloads.
