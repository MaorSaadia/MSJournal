import Link from "next/link";
import { ThemeControl } from "@/components/shell";
export function BooksHeader() {
  return <><a href="#books-main" className="books-skip">Skip to content</a><header className="books-nav"><div className="books-wrap"><Link href="/" className="marketing-brand">MSJournal<span className="books-brand-dot">.</span></Link><nav aria-label="Books navigation"><Link href="/books">Trading Books</Link><Link href="/book">Book Companion</Link><ThemeControl/></nav></div></header></>;
}
export function BooksFooter() {
  return <footer className="books-footer books-wrap"><div><Link href="/" className="marketing-brand">MSJournal<span className="books-brand-dot">.</span></Link><p>Books by Maor Saadia, creator of MSJournal.</p></div><nav aria-label="Books footer"><Link href="/books">Trading Books</Link><Link href="/book">Free worksheets</Link><Link href="/signup">Create account</Link></nav><small>Educational reading. Trading involves risk; no book guarantees trading results or prop firm approval.</small></footer>;
}
