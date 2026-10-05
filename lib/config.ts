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
  OWNER_EMAIL: z.email().transform((value) => value.trim().toLowerCase()),
});
export class ConfigurationError extends Error {
  constructor() {
    super(
      "Configure DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, and OWNER_EMAIL in .env.local. See README.md.",
    );
  }
}
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = environmentSchema.safeParse(env);
  if (!result.success) throw new ConfigurationError();
  return result.data;
}
export function isConfigured() {
  return environmentSchema.safeParse(process.env).success;
}
