import type { NextConfig } from "next";
import { indexableDeployment } from "./lib/seo";

const nextConfig: NextConfig = {
  ...(process.env.MSJOURNAL_BILLING_UI_CHECK === "true" && process.env.NODE_ENV === "development"
    ? { distDir: ".next-billing-ui-check" }
    : {}),
  ...(process.env.MSJOURNAL_WHOP_SANDBOX === "true" &&
  process.env.WHOP_ENVIRONMENT === "sandbox" &&
  process.env.NODE_ENV === "development"
    ? {
        distDir: ".next-whop-sandbox",
        ...(process.env.WHOP_SANDBOX_PUBLIC_URL
          ? { allowedDevOrigins: [new URL(process.env.WHOP_SANDBOX_PUBLIC_URL).hostname] }
          : {}),
      }
    : {}),
  // Recovery/verification links contain credentials in URLs; never log requests.
  logging: false,
  async headers() {
    return [
      ...(!indexableDeployment
        ? [
            {
              source: "/:path*",
              headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
            },
          ]
        : []),
      {
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      // Public book and affiliate HTML pages opt into indexing through their own metadata.
      {
        source:
          "/:path((?!(?:books?|affiliates)(?:/|$)|_next|icon|apple-icon|opengraph-image|robots\\.txt|sitemap\\.xml).+)",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/book/downloads/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
