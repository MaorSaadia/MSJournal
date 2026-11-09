import type { Metadata } from "next";
import { absoluteUrl, indexableDeployment, noIndex, shareImage } from "@/lib/seo";
import { bookById, type TradingBook } from "./catalog";

export function tradingBooksMetadata(book?: TradingBook): Metadata {
  const title = book ? `${book.title}${book.seriesLabel ? ` — ${book.seriesLabel}` : ""}` : "Trading Books by Maor Saadia";
  const description = book ? `${book.subtitle}. ${book.shortDescription}` : "Explore trading books by Maor Saadia, creator of MSJournal. Find your next read on trading foundations, ICT strategies, psychology and discipline.";
  const url = absoluteUrl(book ? `/books/${book.slug}` : "/books");
  const images = book?.cover ? [{url:absoluteUrl(book.cover.path),width:book.cover.width,height:book.cover.height,alt:book.cover.alt}] : [shareImage];
  return { title, description, alternates:{canonical:url}, robots:indexableDeployment ? {index:true,follow:true} : noIndex,
    openGraph:{type:"website",title,description,url,siteName:"MSJournal",images},
    twitter:{card:"summary_large_image",title,description,images},
  };
}
export function bookStructuredData(book: TradingBook) {
  return {"@context":"https://schema.org","@type":"Book","@id":absoluteUrl(`/books/${book.slug}#book`),
    name:book.title, alternativeHeadline:book.subtitle, author:{"@type":"Person",name:book.author},
    description:book.shortDescription, url:absoluteUrl(`/books/${book.slug}`),
    ...(book.cover ? {image:absoluteUrl(book.cover.path)} : {}),
    ...(book.includes ? {hasPart:book.includes.map(bookById).filter((b): b is TradingBook => !!b).map((b) => ({"@type":"Book",name:b.title,url:absoluteUrl(`/books/${b.slug}`)}))} : {}),
  };
}
