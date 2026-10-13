import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => {
      try {
        return ["postgres:", "postgresql:"].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    }),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().refine((value) => {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password &&
      (url.protocol === "https:" ||
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    );
  }),
  RESEND_API_KEY: z.string().optional(),
  AUTH_EMAIL_FROM: z.string().optional(),
  AUTH_REQUIRE_EMAIL_VERIFICATION: z.enum(["true", "false"]).default("false"),
});
export class ConfigurationError extends Error {
  constructor() {
    super(
      "Configure DATABASE_URL, BETTER_AUTH_SECRET, and BETTER_AUTH_URL in .env.local. See README.md.",
    );
  }
}
export function readConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const result = environmentSchema.safeParse(env);
  if (
    !result.success ||
    (env.NODE_ENV === "production" &&
      result.success &&
      ["localhost", "127.0.0.1", "[::1]"].includes(
        new URL(result.data.BETTER_AUTH_URL).hostname,
      )) ||
    (result.data.AUTH_REQUIRE_EMAIL_VERIFICATION === "true" &&
      !emailConfigured(result.data))
  )
    throw new ConfigurationError();
  return result.data;
}
export function isConfigured() {
  try {
    readConfig();
    return true;
  } catch {
    return false;
  }
}
export function emailConfigured(
  env: { RESEND_API_KEY?: string; AUTH_EMAIL_FROM?: string } = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
  },
) {
  return !!env.RESEND_API_KEY?.trim() && !!env.AUTH_EMAIL_FROM?.trim();
}
