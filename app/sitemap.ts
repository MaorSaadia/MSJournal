import type { MetadataRoute } from "next";
import { absoluteUrl, indexableDeployment } from "@/lib/seo";
import { templates } from "@/lib/book/templates";
export default function sitemap(): MetadataRoute.Sitemap {
  return indexableDeployment ? ["/", "/book", ...templates.map(t=>`/book/${t.slug}`)].map(path=>({url:absoluteUrl(path)})) : [];
}
