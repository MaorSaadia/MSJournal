import Link from "next/link";
import { ArrowDown, ArrowUpRight, BookOpen } from "lucide-react";
import { orderedBooks, bookCategories } from "@/lib/books/catalog";
import { tradingBooksMetadata } from "@/lib/books/seo";
import { BookCover } from "@/components/books/cover";
import { BookCard } from "@/components/books/card";
import { BooksMotion } from "@/components/books/motion";

export const metadata = tradingBooksMetadata();
export default async function BooksPage({searchParams}:{searchParams:Promise<{category?:string}>}) {
  const {category} = await searchParams;
  const selected = bookCategories.find((c) => c.toLowerCase() === category);
  const books = orderedBooks.filter((b) => !selected || b.category === selected);
  return <main id="books-main"><section className="books-hero books-wrap"><div className="books-hero-copy"><p className="books-eyebrow">THE MSJOURNAL BOOKSHELF</p><h1>Your next chapter<br/>in <em>trading.</em></h1><p className="books-lead">Start with the foundations. Explore the setups. Work on the discipline behind your decisions.</p><p className="books-author">Books by Maor Saadia, creator of MSJournal.</p><a className="books-text-link" href="#catalog">Find your next read <ArrowDown size={16} aria-hidden="true"/></a></div><div className="books-hero-shelf" aria-label="Explore featured books">{orderedBooks.filter((b) => b.featured).map((b,i) => <Link href={`/books/${b.slug}`} key={b.id} aria-label={`Explore ${b.title}${b.seriesLabel ? ` — ${b.seriesLabel}` : ""}`}><BookCover book={b} preload={i===1} sizes="(max-width: 640px) 26vw, (max-width: 1000px) 25vw, 200px"/></Link>)}</div></section>
    <section id="catalog" className="books-catalog books-wrap" aria-labelledby="catalog-title"><div className="books-catalog-heading"><div><p className="books-eyebrow">CHOOSE YOUR FOCUS</p><h2 id="catalog-title">Read for where you are.</h2></div><p>Foundations, frameworks and a more considered practice.</p></div><nav className="books-filters" aria-label="Book categories">{["All",...bookCategories].map((c) => <Link href={c==="All" ? "/books#catalog" : `/books?category=${c.toLowerCase()}#catalog`} scroll={false} key={c} aria-current={(!selected && c==="All") || selected===c ? "page" : undefined}>{c}</Link>)}</nav><p className="books-count" aria-live="polite">{books.length} {books.length===1 ? "book" : "books"}{selected ? ` / ${selected}` : " / The collection"}</p><BooksMotion selection={selected ?? "All"}><div className="books-grid">{books.map((b) => <BookCard key={b.id} book={b}/>)}</div></BooksMotion></section>
    <section className="books-companion books-wrap"><BookOpen size={28} strokeWidth={1.3} aria-hidden="true"/><div><p className="books-eyebrow">FROM READING TO REFLECTION</p><h2>Make the plan your own.</h2><p>Four free worksheets from The Consistent Day Trader. Use them online, print a copy, or save your work in MSJournal. No book purchase required.</p></div><Link className="books-button" href="/book">Open the free worksheets <ArrowUpRight size={16} aria-hidden="true"/></Link></section>
  </main>;
}
