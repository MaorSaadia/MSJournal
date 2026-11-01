import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
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
