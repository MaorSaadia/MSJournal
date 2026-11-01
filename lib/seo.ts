import type { Metadata } from "next";

export function productionUrl(value = process.env.SITE_URL ?? "https://ms-journal.vercel.app") {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      url.pathname !== "/" || url.search || url.hash ||
      url.hostname === "localhost" || !url.hostname.includes(".") ||
      /^\d+(\.\d+){3}$/.test(url.hostname)) {
    throw new Error("SITE_URL must be a public HTTPS origin without a path, port, query or credentials.");
  }
  return url.origin;
}

export const siteUrl = productionUrl();
export const absoluteUrl = (path: string) => new URL(path, `${siteUrl}/`).toString();
// Never infer canonical URLs from VERCEL_URL, cookies or request hosts.
export const indexableDeployment = process.env.VERCEL_ENV === "production" ||
  (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production");
export const noIndex = { index: false, follow: false } as const;
export const siteTitle = "MSJournal | Futures Trading Journal & Analytics";
export const siteDescription = "Import Tradovate Performance CSVs, explore futures trading analytics, review your trades, and track prop account progress with configured rules.";
export const shareImage = {
  url: absoluteUrl("/opengraph-image"), width: 1200, height: 630,
  alt: "MSJournal — Your trades. Your habits. A clearer picture.",
};

export const publicMetadata: Metadata = {
  title: { absolute: siteTitle },
  description: siteDescription,
  alternates: { canonical: absoluteUrl("/") },
  robots: indexableDeployment ? { index: true, follow: true } : noIndex,
  openGraph: {
    type: "website", locale: "en_US", siteName: "MSJournal",
    title: siteTitle, description: siteDescription, url: absoluteUrl("/"), images: [shareImage],
  },
  twitter: { card: "summary_large_image", title: siteTitle, description: siteDescription, images: [shareImage] },
};

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
