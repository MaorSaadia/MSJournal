import { PublicWebAnalytics } from "@/components/public-web-analytics";
import { indexableDeployment } from "@/lib/seo";
import { BooksHeader, BooksFooter } from "@/components/books/header";
export default function BooksLayout({children}:{children:React.ReactNode}) {
  return <div className="books-public"><PublicWebAnalytics enabled={indexableDeployment} /><BooksHeader/>{children}<BooksFooter/></div>;
}
