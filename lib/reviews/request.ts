import "server-only";
import { requireUser } from "@/lib/session";
import { readBounded } from "./images";
import { ReviewError } from "./model";
export async function readReviewJson(request: Request, limit = 4096) {
  await requireUser(request.headers);
  const bytes = await readBounded(request, limit);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new ReviewError("Invalid review request.");
  }
}
