import { PublicPageLink } from "@/components/public-page-link";
import { BrandLink } from "@/components/brand-link";
import { ThemeControl } from "@/components/shell";

export function BooksHeader() {
  return (
    <>
      <a href="#books-main" className="books-skip">Skip to content</a>
      <header className="books-nav">
        <div className="books-wrap">
          <BrandLink documentNavigation className="books-brand" />
          <nav aria-label="Books navigation">
            <PublicPageLink href="/books">Trading Books</PublicPageLink>
            <PublicPageLink href="/book">Book Companion</PublicPageLink>
            <PublicPageLink href="/">Trading Journal</PublicPageLink>
          </nav>
          <div className="books-nav-actions">
            <ThemeControl />
            <PublicPageLink href="/signup" className="books-button">Start free</PublicPageLink>
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
        <BrandLink documentNavigation className="books-brand" />
        <p>Books by Maor Saadia, creator of MSJournal.</p>
      </div>
      <nav aria-label="Books footer">
        <PublicPageLink href="/books">Trading Books</PublicPageLink>
        <PublicPageLink href="/book">Free worksheets</PublicPageLink>
        <PublicPageLink href="/">Trading Journal</PublicPageLink>
        <PublicPageLink href="/signup">Create account</PublicPageLink>
      </nav>
      <small>Educational reading. Trading involves risk; no book guarantees trading results or prop firm approval.</small>
    </footer>
  );
}
