import type { MetadataRoute } from "next";
import { absoluteUrl, indexableDeployment } from "@/lib/seo";
import { orderedBooks } from "@/lib/books/catalog";
import { templates } from "@/lib/book/templates";
export default function sitemap(): MetadataRoute.Sitemap {
  return indexableDeployment ? ["/", "/books", ...orderedBooks.map(b=>`/books/${b.slug}`), "/book", ...templates.map(t=>`/book/${t.slug}`)].map(path=>({url:absoluteUrl(path)})) : [];
}
