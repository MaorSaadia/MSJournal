import { defineConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
export default defineConfig({
  testDir: "./browser-tests",
  timeout: 60000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100", channel: "chrome", headless: true },
  reporter: "list",
});
