import { ReviewError } from "@/lib/reviews/model";
// Per-process admission limit; archives never become background jobs or cached files.
const active = new Set<string>();
export async function withExportSlot<T>(
  ownerId: string,
  work: () => Promise<T>,
) {
  if (active.has(ownerId) || active.size >= 2)
    throw new ReviewError(
      "An export is already running or the export service is busy. Wait for it to finish, then retry.",
      429,
    );
  active.add(ownerId);
  try {
    return await work();
  } finally {
    active.delete(ownerId);
  }
}
