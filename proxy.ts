import { NextResponse, type NextRequest } from "next/server";
import { affiliateCode, affiliateReferralCookie } from "@/lib/affiliates";

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (request.method === "GET" && (pathname === "/" || pathname === "/affiliates") &&
      !request.headers.has("rsc") && !request.headers.has("next-router-prefetch") &&
      request.headers.get("purpose") !== "prefetch" && searchParams.has("a")) {
    const codes = searchParams.getAll("a");
    const code = codes.length === 1 ? affiliateCode(codes[0]) : undefined;
    const destination = request.nextUrl.clone();
    destination.searchParams.delete("a");
    const response = NextResponse.redirect(destination);
    response.headers.set("Cache-Control", "private, no-store");
    if (code) response.cookies.set(affiliateReferralCookie, code, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production",
      path: "/api/billing",
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  }
  // Overwrite any client-supplied value. Used only to permit the anonymous
  // homepage through the shared workspace layout; every other page still
  // requires the authoritative server session. This is not an auth check.
  const headers = new Headers(request.headers);
  headers.set("x-msjournal-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icon\\.svg|apple-icon\\.png|opengraph-image|robots\\.txt|sitemap\\.xml).*)"],
};
