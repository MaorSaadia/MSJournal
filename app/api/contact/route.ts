import { privateError, privateJson, requireOrigin } from "@/lib/private-api";
import { ReviewError } from "@/lib/reviews/model";
import { deliverContact } from "@/lib/contact/delivery";
import { submissionSchema } from "@/lib/contact/model";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requireOrigin(request);
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json" || !request.body) {
      throw new ReviewError("Please submit the contact form again.", 400);
    }
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let body = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32_768) {
        await reader.cancel();
        throw new ReviewError("Your message is too long.", 413);
      }
      body += decoder.decode(value, { stream: true });
    }
    const submission = submissionSchema.safeParse(JSON.parse(body + decoder.decode()));
    if (!submission.success) throw new ReviewError("Check your topic, reply email and message, then try again.", 400);
    return privateJson(await deliverContact(submission.data, request.headers));
  } catch (error) {
    return privateError(error);
  }
}
