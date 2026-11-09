import Image from "next/image";
import { BookOpen } from "lucide-react";
import type { TradingBook } from "@/lib/books/catalog";

export function BookCover({book,preload=false,sizes="(max-width: 640px) 70vw, (max-width: 1000px) 35vw, 260px"}: {book:TradingBook;preload?:boolean;sizes?:string}) {
  return <div className={`books-cover ${book.cover ? "" : "books-cover-title"}`}>
    {book.cover ? <Image src={book.cover.path} width={book.cover.width} height={book.cover.height} alt={book.cover.alt} sizes={sizes} preload={preload} /> : <div><span>MAOR SAADIA</span><BookOpen size={32} strokeWidth={1.1} aria-hidden="true"/><strong>{book.title}</strong><p>{book.subtitle}</p></div>}
  </div>;
}
