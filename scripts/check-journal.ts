import { loadEnvConfig } from "@next/env";
import { getPool, closePool } from "../db/client";
import Papa from "papaparse";
import { parseReport } from "../lib/imports/parser";
import type { PerformanceValues } from "../lib/imports/types";
import { D } from "../lib/journal/processing";
loadEnvConfig(process.cwd());
async function run() {
  const db = getPool();
  await db.query("select 1");
  console.log("Configured database is reachable.");
  const tables = await db.query(
    "select to_regclass('public.journal_records') is not null as journal, to_regclass('public.tradovate_performance_records') is not null as source",
  );
  console.log("Required tables:", tables.rows[0]);
  if (tables.rows[0].source) {
    const result = await db.query(
      "select count(*)::int as portions, count(*) filter (where bought_at = sold_at)::int as equal_timestamps from tradovate_performance_records",
    );
    console.log("Stored source structure:", result.rows[0]);
    const coverage = await db.query(`select
      (select count(*)::int from journal_records where current=true) as published_groups,
      (select count(*)::int from journal_sources) as linked_portions,
      (select count(*)::int from tradovate_performance_records p where not exists(select 1 from journal_sources s where s.source_id=p.id and s.owner_id=p.owner_id)) as unprocessed_portions,
      (select count(*)::int from journal_processing where status<>'Ready') as pending_accounts,
      (select count(*)::int from journal_portion_fees where amount is not null) as fee_covered_portions,
      (select count(*)::int from tradovate_performance_records p where p.bought_at<>p.sold_at and exists(select 1 from journal_sources s join journal_records r on r.id=s.record_id and r.owner_id=s.owner_id and r.current=true where s.source_id=p.id and s.owner_id=p.owner_id and r.direction<>'unknown')) as reliable_entry_portions`);
    console.log(
      "Journal publication and dashboard coverage:",
      coverage.rows[0],
    );
    const sources = await db.query(
      "select raw_values, source_timezone, quantity, buy_price, sell_price, gross_pnl, bought_at, sold_at, buy_fill_id, sell_fill_id from tradovate_performance_records",
    );
    for (const row of sources.rows) {
      const fields = Object.keys(row.raw_values);
      const parsed = parseReport(
        Buffer.from(
          Papa.unparse({
            fields,
            data: [fields.map((key) => row.raw_values[key])],
          }),
        ),
        "stored-verification.csv",
        "performance",
        row.source_timezone,
      );
      const value = parsed.rows[0]?.values as PerformanceValues | undefined;
      if (
        parsed.errors.length ||
        parsed.rows.length !== 1 ||
        !value ||
        !new D(value.quantity).eq(row.quantity) ||
        !new D(value.grossPnl).eq(row.gross_pnl) ||
        !new D(value.buyPrice).eq(row.buy_price) ||
        !new D(value.sellPrice).eq(row.sell_price) ||
        value.buyFillId !== row.buy_fill_id ||
        value.sellFillId !== row.sell_fill_id ||
        value.boughtAt !== row.bought_at.toISOString() ||
        value.soldAt !== row.sold_at.toISOString()
      )
        throw new Error("Stored source verification failed.");
    }
    console.log(
      "Normalized timestamps, quantities, prices, fill identifiers and gross P&L match preserved raw sources.",
    );
  }
}
run()
  .catch((error) => {
    const codes: string[] = [];
    let e: unknown = error;
    for (let i = 0; e && i < 5; i++) {
      const item = e as { code?: string; cause?: unknown };
      if (item.code && /^[A-Z0-9_]{2,30}$/.test(item.code))
        codes.push(item.code);
      e = item.cause;
    }
    console.error(
      "Database check failed. Safe diagnostic codes:",
      codes.length ? codes.join(",") : "unavailable",
    );
    process.exitCode = 1;
  })
  .finally(() => closePool());
