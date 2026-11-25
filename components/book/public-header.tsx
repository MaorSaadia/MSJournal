import { PublicPageLink } from "@/components/public-page-link";
import Link from "next/link";
import { ThemeControl } from "@/components/shell";
export function BookHeader({documentNavigation = true}: {documentNavigation?: boolean}){const PageLink = documentNavigation ? PublicPageLink : Link; return <header className="book-nav"><PageLink className="marketing-brand" href="/">MSJournal</PageLink><nav aria-label="Book companion"><PageLink href="/books">Trading Books</PageLink><PageLink href="/book">Book Companion</PageLink><PageLink href="/worksheets">My Worksheets</PageLink><ThemeControl /></nav></header>;}
