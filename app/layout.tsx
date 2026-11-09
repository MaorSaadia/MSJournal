import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import "./day-two.css";
import "./day-three.css";
import "./day-four.css";
import "./day-five.css";
import "./day-six.css";
import "./day-seven.css";
import "./day-eight.css";
import "./day-eight-dashboard.css";
import "./day-nine.css";
import "./prop-setup.css";
import "./prop-overview.css";
import "./day-ten.css";
import "./day-eleven.css";
import "./confirmations.css";
import "./day-twelve.css";
import "./day-thirteen.css";
import "./fees.css";
import "./loading.css";
import "./page-headers.css";
import "./trade-review.css";
import "./marketing.css";
import "./book.css";
import "./books.css";
import { Providers } from "@/components/providers";
import { noIndex, siteDescription, siteTitle, siteUrl, shareImage } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "MSJournal",
  title: { default: siteTitle, template: "%s | MSJournal" },
  description: siteDescription,
  robots: noIndex,
  openGraph: { type: "website", siteName: "MSJournal", title: siteTitle, description: siteDescription, images: [shareImage] },
  twitter: { card: "summary_large_image", title: siteTitle, description: siteDescription, images: [shareImage] },
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
