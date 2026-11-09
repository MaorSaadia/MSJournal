import { describe, it, expect } from "vitest";
import { stat } from "node:fs/promises";
import sharp from "sharp";
import { amazonLink, tradingBooks, findBook } from "@/lib/books/catalog";
import { bookStructuredData, tradingBooksMetadata } from "@/lib/books/seo";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AmazonAction } from "@/components/books/card";

describe("public trading books", () => {
  it("has stable unique routes, real covers and only explicit collection overlap", async () => {
    expect(new Set(tradingBooks.map((b) => b.id)).size).toBe(9);
    expect(new Set(tradingBooks.map((b) => b.slug)).size).toBe(9);
    expect(findBook("missing-book")).toBeUndefined();
    for (const book of tradingBooks) {
      expect(book.amazonUrl ? amazonLink(book.amazonUrl) : null).toBe(book.amazonUrl || null);
      expect(book.related.every((id) => tradingBooks.some((b) => b.id === id))).toBe(true);
      if (book.cover) {
        const file = `public${book.cover.path}`;
        expect((await stat(file)).size).toBeLessThan(400000);
        const metadata = await sharp(file).metadata();
        expect([metadata.width,metadata.height]).toEqual([book.cover.width,book.cover.height]);
      }
    }
    expect(tradingBooks.find((b) => b.id === "masterclass")?.includes).toEqual(["absolute-beginners","smart-money","ict-playbook"]);
    expect(tradingBooks.find((b) => b.id === "consistent-day-trader")?.companionHref).toBe("/book");
  });
  it("enables only configured valid Amazon destinations", () => {
    for (const invalid of [undefined,""," ","#","javascript:alert(1)","http://amazon.com/dp/test","https://amazon.com.evil.test/dp/test","https://evilamazon.com","https://user:pass@amazon.com","https://amazon.com:9999","https://example.com"])
      expect(amazonLink(invalid)).toBeNull();
    for (const valid of ["https://www.amazon.com/dp/EXAMPLE","https://amazon.co.uk/dp/EXAMPLE","https://amzn.to/example"])
      expect(amazonLink(valid)).toBe(valid);
    expect(renderToStaticMarkup(createElement(AmazonAction,{book:{...tradingBooks[0],amazonUrl:""}}))).toBe("");
    const html=renderToStaticMarkup(createElement(AmazonAction,{book:{...tradingBooks[0],amazonUrl:"https://www.amazon.com/dp/EXAMPLE"}}));
    expect(html).toContain("View on Amazon");
    expect(html).toContain('href="https://www.amazon.com/dp/EXAMPLE"');
  });
  it("renders the supplied purchase links for the matching books", () => {
    const expected: Record<string,string> = {"absolute-beginners":"B0FQBBK2SH","smart-money":"B0FMDZ98CL","ict-playbook":"B0FMJWBDJ3","masterclass":"B0FRM58PL5","ict-codex":"B0G83TBLYC","disciplined-edge":"B0GFCX3QGV","operator-1":"B0GX2YKYJH","operator-2":"B0H3THY9VN"};
    for (const [id,asin] of Object.entries(expected)) {
      const book=tradingBooks.find((b)=>b.id===id)!;
      expect(book.amazonUrl).toBe(`https://www.amazon.com/dp/${asin}`);
      expect(renderToStaticMarkup(createElement(AmazonAction,{book}))).toContain(`href="https://www.amazon.com/dp/${asin}"`);
    }
    expect(tradingBooks.find((b)=>b.id==="consistent-day-trader")?.amazonUrl).toBe("");
  });
  it("uses supplied book facts in sharing metadata and structured data", () => {
    for (const book of tradingBooks) {
      const metadata = tradingBooksMetadata(book);
      expect(metadata.alternates?.canonical).toContain(`/books/${book.slug}`);
      expect(metadata.openGraph?.title).toContain(book.title);
      const schema = bookStructuredData(book);
      expect(schema.name).toBe(book.title);
      expect(schema.author.name).toBe("Maor Saadia");
      expect(schema).not.toHaveProperty("offers");
      expect(schema).not.toHaveProperty("aggregateRating");
      expect(schema).not.toHaveProperty("datePublished");
      expect(schema).not.toHaveProperty("isbn");
    }
  });
});
