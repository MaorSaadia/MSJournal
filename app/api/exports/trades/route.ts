import { tradeView } from "@/lib/journal/view-service";
import { viewSchema } from "@/lib/journal/view-model";
import {
  csvHeader,
  csvRow,
  CSV_LIMIT,
  type ExportRecord,
} from "@/lib/exports/csv";
import { privateError } from "@/lib/private-api";
import { requireUser } from "@/lib/session";
import { withExportSlot } from "@/lib/exports/limits";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const input = Object.fromEntries(new URL(request.url).searchParams);
    delete input.page;
    delete input.size;
    delete input.record;
    const q = viewSchema.parse(input);
    const owner = await requireUser(request.headers);
    const data = await withExportSlot(owner.id, () =>
      tradeView(q, request.headers, CSV_LIMIT),
    );
    const filename = `msjournal-${q.mode}-trades-${q.start ?? "all"}-${q.end ?? "dates"}-${q.dateBasis}-${q.basis}-${q.outcomeBasis}.csv`;
    const encoder = new TextEncoder();
    let index = -1;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index === -1) {
          controller.enqueue(encoder.encode("\uFEFF" + csvHeader()));
          index = 0;
          return;
        }
        const end = Math.min(index + 100, data.rows.length);
        let chunk = "";
        while (index < end)
          chunk += csvRow(data.rows[index++] as ExportRecord, q, data.timezone);
        if (chunk) controller.enqueue(encoder.encode(chunk));
        if (index >= data.rows.length) controller.close();
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
        "X-Export-Record-Count": String(data.rows.length),
      },
    });
  } catch (e) {
    return privateError(e);
  }
}
