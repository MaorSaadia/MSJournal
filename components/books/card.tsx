import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { amazonLink, type TradingBook } from "@/lib/books/catalog";
import { BookCover } from "./cover";

export function AmazonAction({book}: {book:TradingBook}) {
  const url = amazonLink(book.amazonUrl);
  return url ? <a className="books-button" href={url} target="_blank" rel="noopener noreferrer">View on Amazon <ArrowUpRight size={16} aria-hidden="true"/><span className="sr-only"> (opens in a new tab)</span></a> : null;
}
export function BookCard({book,compact=false}: {book:TradingBook;compact?:boolean}) {
  return <article className={`books-card ${compact ? "books-card-compact" : ""}`} data-book-enter>
    <Link href={`/books/${book.slug}`} className="books-card-link">
      <div className="books-card-art"><BookCover book={book}/><span className="books-cover-shadow" aria-hidden="true"/></div>
      <div className="books-card-copy"><span className="books-label">{book.category}{book.seriesLabel ? ` / ${book.seriesLabel}` : ""}</span>
        <h3>{book.title}</h3><p className="books-card-subtitle">{book.subtitle}</p>
        <p>{book.shortDescription}</p>{!compact && <p className="books-audience"><strong>For you if:</strong> {book.audience}</p>}
        <span className="books-explore">Explore book <ArrowUpRight size={16} aria-hidden="true"/></span>
      </div>
    </Link>
    <div className="books-card-actions"><AmazonAction book={book}/>{book.companionHref && <Link href={book.companionHref}>Open the free worksheets <ArrowUpRight size={14} aria-hidden="true"/></Link>}</div>
  </article>;
}
