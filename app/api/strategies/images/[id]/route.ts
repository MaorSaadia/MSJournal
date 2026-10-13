import {
  exampleContent,
  editExample,
  removeExample,
} from "@/lib/strategies/images";
import { requireOrigin, privateJson, privateError } from "@/lib/private-api";
import { readBounded } from "@/lib/reviews/images";
import { requireUser } from "@/lib/session";
import { ReviewError } from "@/lib/reviews/model";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const image = await exampleContent(
      (await params).id,
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
    await requireUser(request.headers);
    const body = JSON.parse(
      (await readBounded(request, 8192)).toString("utf8"),
    );
    return privateJson(
      await editExample({ ...body, id: (await params).id }, request.headers),
    );
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
    await requireUser(request.headers);
    if (
      JSON.parse((await readBounded(request, 8192)).toString("utf8"))
        .confirmed !== true
    )
      throw new ReviewError("Confirm example removal.");
    return privateJson(await removeExample((await params).id, request.headers));
  } catch (e) {
    return privateError(e);
  }
}
