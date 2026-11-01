import { describe, expect, it, vi } from "vitest";
import { productionUrl, serializeJsonLd } from "@/lib/seo";

describe("SEO configuration boundaries", () => {
  it("uses a stable HTTPS origin and rejects ambiguous site URLs", () => {
    expect(productionUrl("https://ms-journal.vercel.app/")).toBe("https://ms-journal.vercel.app");
    for (const value of ["http://localhost:3000", "https://localhost", "https://127.0.0.1", "https://example.com/path", "https://example.com?x=1", "https://user:password@example.com", "https://example.com:3000"]) {
      expect(() => productionUrl(value)).toThrow();
    }
  });
  it("escapes script boundaries in structured data", () => {
    const value = { name: "</script><script>unexpected</script>" };
    expect(serializeJsonLd(value)).not.toContain("<");
    expect(JSON.parse(serializeJsonLd(value))).toEqual(value);
  });
  it("indexes only the homepage in production and never a preview deployment", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.resetModules();
    const production = await import("../app/sitemap");
    expect(production.default().map((entry) => entry.url)).toEqual(["https://ms-journal.vercel.app/"]);
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.resetModules();
    const preview = await import("../app/sitemap");
    expect(preview.default()).toEqual([]);
    expect((await import("../lib/seo")).publicMetadata.robots).toEqual({ index: false, follow: false });
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
