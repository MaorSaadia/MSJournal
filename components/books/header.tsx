import Link from "next/link";
import { BrandLink } from "@/components/brand-link";
import { ThemeControl } from "@/components/shell";

export function BooksHeader() {
  return (
    <>
      <a href="#books-main" className="books-skip">Skip to content</a>
      <header className="books-nav">
        <div className="books-wrap">
          <BrandLink className="books-brand" />
          <nav aria-label="Books navigation">
            <Link href="/books">Trading Books</Link>
            <Link href="/book">Book Companion</Link>
            <Link href="/">Trading Journal</Link>
          </nav>
          <div className="books-nav-actions">
            <ThemeControl />
            <Link href="/signup" className="books-button">Start free</Link>
          </div>
        </div>
      </header>
    </>
  );
}

export function BooksFooter() {
  return (
    <footer className="books-footer books-wrap">
      <div>
        <BrandLink className="books-brand" />
        <p>Books by Maor Saadia, creator of MSJournal.</p>
      </div>
      <nav aria-label="Books footer">
        <Link href="/books">Trading Books</Link>
        <Link href="/book">Free worksheets</Link>
        <Link href="/">Trading Journal</Link>
        <Link href="/signup">Create account</Link>
      </nav>
      <small>Educational reading. Trading involves risk; no book guarantees trading results or prop firm approval.</small>
    </footer>
  );
}
