import Link from "next/link";
export default function NotFound() {
  return <main className="public-not-found"><p className="eyebrow">MSJOURNAL · 404</p><h1>Page not found</h1><p>This address does not point to a page in MSJournal.</p><Link href="/">Back to home</Link></main>;
}
