import Link from "next/link";
import { ArrowDownToLine, ArrowRight } from "lucide-react";
import { book, templates } from "@/lib/book/templates";
import { bookMetadata } from "@/lib/book/seo";
import { BookDirectory } from "@/components/book/directory";
import { BookHeader } from "@/components/book/public-header";
export const metadata=bookMetadata();
export default function BookPage(){return <div className="book-public book-current"><BookHeader /><main><section className="book-compact-hero"><p className="book-eyebrow">THE READER’S COMPANION</p><h1>Make the plan yours.</h1><p className="book-hero-subtitle">Four practical worksheets from <em>{book.title}</em> by {book.author}. Prepare with clarity, pause under pressure, and review one change at a time.</p><p className="book-free">Free to use. No subscription required.</p><div className="book-links"><Link href="/worksheets">My saved worksheets <ArrowRight size={16} aria-hidden="true" /></Link><details className="worksheet-menu"><summary><ArrowDownToLine size={16} aria-hidden="true" /> Download all four</summary><div className="worksheet-menu-items"><a href="/book/downloads/workbook.pdf?edition=2&amp;layout=3">A4 workbook</a><a href="/book/downloads/workbook.pdf?edition=2&amp;layout=3&amp;paper=letter">US Letter workbook</a></div></details></div></section><BookDirectory templates={templates} /><p className="book-closing-note">Start wherever it helps. Write and print as a guest, or sign in to save your worksheets and return to them later.</p></main></div>;}
