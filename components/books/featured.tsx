import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { orderedBooks } from "@/lib/books/catalog";
import { BookCard } from "./card";
export function FeaturedBooks() {
  return <section className="books-featured marketing-wrap" aria-labelledby="featured-books-title" data-reveal><div className="books-featured-heading"><div><p className="marketing-kicker">READ. REFLECT. PUT IT INTO PRACTICE.</p><h2 id="featured-books-title">A little perspective.<br/>A new chapter.</h2><p>Books by Maor Saadia, creator of MSJournal.</p></div><Link className="marketing-text-button" href="/books">Browse all books <ArrowUpRight size={17} aria-hidden="true"/></Link></div><div className="books-grid">{orderedBooks.filter((b) => b.featured).slice(0,3).map((b) => <BookCard key={b.id} book={b} compact/>)}</div></section>;
}
