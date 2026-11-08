import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { strategies } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { privateJson, privateError } from "@/lib/private-api";
import { confirmations } from "@/lib/reviews/confirmations";
import { emotions } from "@/lib/reviews/model";
import { getPreferences } from "@/lib/preferences";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request.headers);
    const db = getDb();
    const [labels, strategyRows, preferences] = await Promise.all([
      db.execute<{ kind: string; label: string }>(sql`
        select distinct 'confirmation' as kind, label from journal_reviews r
        cross join lateral jsonb_array_elements_text(coalesce(r.fields->'confirmations','[]'::jsonb)) label
        where r.owner_id=${user.id}
        union select distinct 'emotion' as kind, label from journal_reviews r
        cross join lateral jsonb_each(r.fields->'emotions') stage
        cross join lateral jsonb_array_elements_text(stage.value) label
        where r.owner_id=${user.id}`),
      db.select({ id: strategies.id, fields: strategies.fields }).from(strategies).where(and(eq(strategies.ownerId, user.id))),
      getPreferences(request.headers),
    ]);
    return privateJson({ userId: user.id, timezone: preferences.displayTimezone,
      confirmations: [...new Set([...confirmations, ...labels.rows.filter((r) => r.kind === "confirmation").map((r) => r.label)])],
      emotions: [...new Set([...emotions, ...labels.rows.filter((r) => r.kind === "emotion").map((r) => r.label)])],
      strategies: strategyRows.map((r) => ({ id: r.id, name: r.fields.name })),
    });
  } catch (e) { return privateError(e); }
}
