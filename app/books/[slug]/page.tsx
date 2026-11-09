import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ArrowRight, Check } from "lucide-react";
import { findBook, orderedBooks, bookById, type TradingBook } from "@/lib/books/catalog";
import { bookStructuredData, tradingBooksMetadata } from "@/lib/books/seo";
import { serializeJsonLd } from "@/lib/seo";
import { BookCover } from "@/components/books/cover";
import { BookCard, AmazonAction } from "@/components/books/card";
import { BooksMotion } from "@/components/books/motion";

export const dynamicParams = false;
export function generateStaticParams() { return orderedBooks.map((b) => ({slug:b.slug})); }
export async function generateMetadata({params}:{params:Promise<{slug:string}>}) {
  const book = findBook((await params).slug);
  if (!book) notFound();
  return tradingBooksMetadata(book);
}
export default async function BookDetail({params}:{params:Promise<{slug:string}>}) {
  const book = findBook((await params).slug);
  if (!book) notFound();
  const related = book.related.map(bookById).filter((b):b is TradingBook => !!b);
  return <main id="books-main" className="books-detail books-wrap"><script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd(bookStructuredData(book))}}/>
    <nav className="books-breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><Link href="/books">Trading Books</Link><span aria-hidden="true">/</span><span aria-current="page">{book.title}{book.seriesLabel ? ` — ${book.seriesLabel}` : ""}</span></nav>
    <BooksMotion><section className="books-detail-hero"><div className="books-detail-art" data-book-enter><BookCover book={book} preload sizes="(max-width: 700px) 70vw, 380px"/></div><div className="books-detail-intro" data-book-enter><p className="books-eyebrow">{book.category}{book.seriesLabel ? ` / ${book.seriesLabel}` : ""}</p><h1>{book.title}</h1><p className="books-subtitle">{book.subtitle}</p><p className="books-byline">By {book.author}</p><p className="books-lead">{book.shortDescription}</p><div className="books-detail-actions"><AmazonAction book={book}/>{book.companionHref && <Link className="books-text-link" href={book.companionHref}>Open the free worksheets <ArrowUpRight size={16} aria-hidden="true"/></Link>}</div><a href="#about-book" className="books-text-link books-about-link">A closer look <ArrowRight size={16} aria-hidden="true"/></a></div></section></BooksMotion>
    {book.includes && <aside className="books-overlap"><span className="books-label">THE 3-IN-1 COLLECTION</span><h2>Three titles. One volume.</h2><p>This collection includes the following books, also listed individually here. Their content overlaps with this volume.</p><ul>{book.includes.map(bookById).filter((b):b is TradingBook => !!b).map((b) => <li key={b.id}><Link href={`/books/${b.slug}`}>{b.title} <ArrowUpRight size={14} aria-hidden="true"/></Link></li>)}</ul></aside>}
    <div id="about-book" className="books-reading"><section><p className="books-eyebrow">A CLOSER LOOK</p><h2>About the book</h2>{book.fullDescription.map((p) => <p key={p}>{p}</p>)}</section><aside><section className="books-audience-panel"><span className="books-label">YOUR NEXT READ?</span><h2>Who this book is for</h2><p>{book.audience}</p></section><section className="books-learning"><h2>What you’ll learn</h2><ul>{book.highlights.map((h) => <li key={h}><Check size={16} aria-hidden="true"/><span>{h}</span></li>)}</ul></section></aside></div>
    {book.companionHref && <section className="books-detail-worksheets"><div><h2>Put the reading into your own words.</h2><p>The four companion worksheets are free to use, whether or not you own the book.</p></div><Link className="books-button" href={book.companionHref}>Open the free worksheets <ArrowUpRight size={16} aria-hidden="true"/></Link></section>}
    <section className="books-related" aria-labelledby="related-title"><div className="books-catalog-heading"><div><p className="books-eyebrow">KEEP EXPLORING</p><h2 id="related-title">Another perspective.</h2></div><Link className="books-text-link" href="/books">Browse all books <ArrowUpRight size={16} aria-hidden="true"/></Link></div><div className="books-grid">{related.map((b) => <BookCard key={b.id} book={b} compact/>)}</div></section>
  </main>;
}
