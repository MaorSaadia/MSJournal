import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";
import { isConfigured, emailConfigured } from "@/lib/config";
import { publicAuthPaths } from "@/lib/auth-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "");
  let response: Response;
  if (
    !publicAuthPaths.has(path) &&
    !/^\/reset-password\/[A-Za-z0-9_-]+$/.test(path)
  )
    response = Response.json(
      {
        message:
          "This authentication action is not available in this private workspace.",
      },
      { status: 403 },
    );
  else if (!isConfigured())
    response = Response.json(
      {
        message:
          "Private sign-in is not configured yet. Follow the local setup instructions in README.md.",
      },
      { status: 503 },
    );
  else if (
    ["/request-password-reset", "/send-verification-email"].includes(path) &&
    !emailConfigured()
  )
    response = Response.json(
      {
        code: "EMAIL_UNAVAILABLE",
        message:
          "Email recovery is temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    );
  else {
    try {
      const handlers = toNextJsHandler(getAuth());
      response = await (request.method === "GET"
        ? handlers.GET(request)
        : handlers.POST(request));
      if (response.status >= 500)
        response = Response.json(
          {
            code: "AUTH_UNAVAILABLE",
            message:
              "Authentication is temporarily unavailable. Please try again later.",
          },
          { status: 503 },
        );
    } catch {
      response = Response.json(
        {
          message:
            "Authentication is temporarily unavailable. Please try again later.",
        },
        { status: 503 },
      );
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const GET = handle;
export const POST = handle;
