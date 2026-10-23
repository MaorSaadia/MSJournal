import { accountDeletionPreview } from "@/lib/accounts/deletion";
import { privateError, privateJson } from "@/lib/private-api";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return privateJson(await accountDeletionPreview((await params).id, request.headers)); }
  catch (error) { return privateError(error); }
}
