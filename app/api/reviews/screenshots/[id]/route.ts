import { readReviewJson } from "@/lib/reviews/request";
import {
  screenshotContent,
  editScreenshot,
  removeScreenshot,
} from "@/lib/reviews/service";
import { requireOrigin, privateJson, privateError } from "@/lib/private-api";
import { ReviewError } from "@/lib/reviews/model";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params,
      image = await screenshotContent(
        id,
        new URL(request.url).searchParams.get("thumbnail") === "1",
        request.headers,
      );
    return new Response(new Uint8Array(image.bytes), {
      headers: {
        "Content-Type": image.mime,
        "Content-Length": String(image.bytes.length),
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    return privateError(e);
  }
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireOrigin(request);
    const { id } = await params,
      body = await readReviewJson(request);
    return privateJson(await editScreenshot({ ...body, id }, request.headers));
  } catch (e) {
    return privateError(e);
  }
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireOrigin(request);
    if ((await readReviewJson(request)).confirmed !== true)
      throw new ReviewError("Confirm screenshot removal.");
    return privateJson(
      await removeScreenshot((await params).id, request.headers),
    );
  } catch (e) {
    return privateError(e);
  }
}
