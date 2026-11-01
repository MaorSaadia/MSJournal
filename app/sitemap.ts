import type { MetadataRoute } from "next";
import { absoluteUrl, indexableDeployment } from "@/lib/seo";
export default function sitemap(): MetadataRoute.Sitemap {
  return indexableDeployment ? [{ url: absoluteUrl("/") }] : [];
}
