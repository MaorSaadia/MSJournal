import "server-only";
import { ZodError } from "zod";
import { readConfig } from "./config";
import { UnauthorizedError } from "./session";
import { DuplicateAccountError, NotFoundError } from "./accounts/service";
import { ImportError } from "./imports/errors";
import { ReviewError } from "./reviews/model";
export function requireOrigin(request: Request) {
  if (
    request.headers.get("origin") !==
    new URL(readConfig().BETTER_AUTH_URL).origin
  )
    throw new OriginError();
}
class OriginError extends Error {}
export function privateJson(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}
export function privateError(error: unknown) {
  if(error instanceof ReviewError)return privateJson({message:error.message},error.status);
  if (error instanceof ImportError)
    return privateJson({ message: error.message }, error.status);
  if (error instanceof UnauthorizedError)
    return privateJson({ message: error.message }, 401);
  if (error instanceof OriginError)
    return privateJson({ message: "Request origin is not allowed." }, 403);
  if (error instanceof NotFoundError)
    return privateJson({ message: error.message }, 404);
  if (error instanceof DuplicateAccountError)
    return privateJson(
      { message: error.message, field: "brokerIdentifier" },
      409,
    );
  if (error instanceof ZodError)
    return privateJson(
      {
        message: "Check the highlighted fields.",
        issues: error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      400,
    );
  if (error instanceof SyntaxError)
    return privateJson({ message: "Invalid request body." }, 400);
  // No database messages, SQL, credentials, or account values reach logs/responses.
  return privateJson(
    {
      message:
        "The operation could not be completed. Check the database connection and try again.",
    },
    503,
  );
}
