import type { Metadata } from "next";
import { absoluteUrl, indexableDeployment, noIndex, shareImage } from "@/lib/seo";
import { book, type Template } from "./templates";
export function bookMetadata(t?:Template):Metadata {
  const title=t ? `${t.title} — Appendix ${t.letter}` : `${book.title} — Book Companion`;
  const description=t ? `${t.when}. Free companion worksheet from ${book.title} by ${book.author}. Fill online, print or save with a free MSJournal account.` : `Free companion worksheets for ${book.title} by ${book.author}. Explore all 12 appendices, use them online, print or download the workbook. No subscription required.`;
  const url=absoluteUrl(t ? `/book/${t.slug}` : "/book");
  return {title,description,alternates:{canonical:url},robots:indexableDeployment ? {index:true,follow:true}:noIndex,openGraph:{type:"website",title,description,url,siteName:"MSJournal",images:[shareImage]},twitter:{card:"summary_large_image",title,description,images:[shareImage]}};
}
