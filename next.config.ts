import type { NextConfig } from "next";
import { indexableDeployment } from "./lib/seo";

const nextConfig: NextConfig = {
  // Recovery/verification links contain credentials in URLs; never log requests.
  logging: false,
  async headers() {
    return [
      ...(!indexableDeployment ? [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }] : []),
      { source: "/api/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      // Every document except the public homepage is intentionally non-indexable.
      { source: "/:path((?!_next|icon|apple-icon|opengraph-image|robots\\.txt|sitemap\\.xml).+)", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      {
        source: "/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
