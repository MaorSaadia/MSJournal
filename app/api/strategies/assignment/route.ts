import {
  discardRecovery,
  getAssignment,
  saveAssignment,
  recoveryAssignments,
} from "@/lib/strategies/service";
import { requireOrigin, privateJson, privateError } from "@/lib/private-api";
import { requireUser } from "@/lib/session";
import { readBounded } from "@/lib/reviews/images";
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    return privateJson(
      p.get("recovery") === "1"
        ? await recoveryAssignments(request.headers)
        : await getAssignment(p.get("recordId") ?? "", request.headers),
    );
  } catch (e) {
    return privateError(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    return privateJson(
      await saveAssignment(
        JSON.parse((await readBounded(request, 32768)).toString("utf8")),
        request.headers,
      ),
    );
  } catch (e) {
    return privateError(e);
  }
}

export async function DELETE(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    return privateJson(
      await discardRecovery(
        JSON.parse((await readBounded(request, 8192)).toString("utf8")),
        request.headers,
      ),
    );
  } catch (e) {
    return privateError(e);
  }
}
