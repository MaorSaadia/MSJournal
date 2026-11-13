import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { readConfig } from "@/lib/config";
import { siteUrl } from "@/lib/seo";
import { completeRecovery } from "@/lib/billing/provider";
export const maxDuration = 60;
export async function GET(request: Request) {
  const origin =
    process.env.NODE_ENV === "production"
      ? siteUrl
      : new URL(readConfig().BETTER_AUTH_URL).origin;
  const url = new URL(request.url);
  try {
    const user = await requireUser(request.headers);
    if (url.searchParams.has("error"))
      return NextResponse.redirect(
        `${origin}/settings/billing?link=canceled`,
        303,
      );
    await completeRecovery(
      user.id,
      url.searchParams.get("state") ?? "",
      url.searchParams.get("code") ?? "",
    );
    return NextResponse.redirect(
      `${origin}/settings/billing?link=checked`,
      303,
    );
  } catch {
    return NextResponse.redirect(`${origin}/settings/billing?link=failed`, 303);
  }
}
