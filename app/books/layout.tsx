import { BooksHeader, BooksFooter } from "@/components/books/header";
export default function BooksLayout({children}:{children:React.ReactNode}) {
  return <div className="books-public"><BooksHeader/>{children}<BooksFooter/></div>;
}
