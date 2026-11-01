import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
export default function robots(): MetadataRoute.Robots {
  // Auth/private pages remain crawlable so their noindex can be read.
  // Authorization, not robots.txt, protects their contents.
  return { rules: { userAgent: "*", allow: "/", disallow: "/api/" }, sitemap: absoluteUrl("/sitemap.xml") };
}
