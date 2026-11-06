import Link from "next/link";
import { ThemeControl } from "@/components/shell";
export function BookHeader(){return <header className="book-nav"><Link className="marketing-brand" href="/">MSJournal</Link><nav aria-label="Book companion"><Link href="/book">Book Companion</Link><Link href="/worksheets">My Worksheets</Link><ThemeControl /></nav></header>;}
