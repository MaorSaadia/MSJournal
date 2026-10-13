import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
vi.mock("server-only", () => ({}));
import * as schema from "@/db/schema";
import { backupCatalog, validateBackup } from "@/lib/exports/catalog";
import { csvCell, csvRow, csvHeader } from "@/lib/exports/csv";
import { viewSchema } from "@/lib/journal/view-model";
import { zipArchive } from "@/lib/exports/zip";
import { backupImages, MissingImagesError } from "@/lib/exports/backup";
import { readConfig } from "@/lib/config";
import Papa from "papaparse";

describe("portable export safety", () => {
  it("escapes text formulas, quotes and multiline content while keeping signed decimal financial values", () => {
    for (const value of [
      "=HYPERLINK(1)",
      " \t+cmd",
      "@SUM(1)",
      "-formula",
      "\rname",
    ])
      expect(csvCell(value)).toContain("'");
    expect(csvCell("-123.00000001", true)).toBe('"-123.00000001"');
    expect(csvCell("-formula", true)).toContain("'");
    expect(csvCell(null, true)).toBe('""');
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    const q = viewSchema.parse({
      dateBasis: "activity",
      start: "2026-10-01",
      end: "2026-10-01",
      basis: "net",
      outcomeBasis: "portions",
    });
    const row = {
      id: "r",
      type: "portion" as const,
      status: "Matched portions",
      accountId: "a",
      account: "=Synthetic",
      symbol: "MNQZ6",
      root: "MNQ",
      direction: "unknown",
      entry: null,
      exit: "2026-10-01T12:00:00Z",
      duration: null,
      quantity: "1.00000001",
      fullQuantity: "2.00000001",
      entryPrice: null,
      exitPrice: "1.1234567890123456",
      gross: "-1.00000001",
      fullGross: "5.00000001",
      fees: null,
      net: null,
      fullFees: null,
      fullNet: null,
      estimated: false,
      feeKind: "Unknown",
      partial: true,
      imported: null,
    };
    const result = Papa.parse<Record<string, string>>(
      csvHeader() + csvRow(row, q, "Asia/Jerusalem"),
      { header: true, skipEmptyLines: true },
    ).data[0];
    expect(result.account_name).toBe("'=Synthetic");
    expect(result.selected_gross_pnl).toBe("-1.00000001");
    expect(result.full_record_gross_pnl).toBe("5.00000001");
    expect(result.selected_net_pnl).toBe("");
    expect(result.entry_price).toBe("");
    expect(result.direction).toBe("");
    expect(result.exit_utc).toBe("2026-10-01T12:00:00.000Z");
    expect(result.financial_scope).toBe("selected realized activity");
  });
  it("covers every journal schema table and excludes authentication storage", () => {
    const excluded = [
      "auth_users",
      "auth_sessions",
      "auth_accounts",
      "auth_verifications",
      "auth_rate_limits",
    ];
    const tables = Object.values(schema)
      .filter((value) => is(value, PgTable))
      .map((t) => getTableConfig(t as PgTable).name)
      .filter((name) => !excluded.includes(name));
    expect(backupCatalog.map((c) => c.name).sort()).toEqual(tables.sort());
    expect(
      backupCatalog
        .flatMap((c) => c.columns)
        .some((c) => /password|token|secret/i.test(c)),
    ).toBe(false);
    expect(() =>
      validateBackup(
        {
          auth_users: [{ id: "owner" }],
          trading_accounts: [{ id: "foreign", owner_id: "other" }],
        },
        "owner",
      ),
    ).toThrow();
    expect(() =>
      validateBackup(
        {
          auth_users: [{ id: "owner" }],
          review_attachments: [
            {
              id: "image",
              owner_id: "owner",
              review_id: "foreign",
              trading_account_id: "foreign",
            },
          ],
        },
        "owner",
      ),
    ).toThrow();
  });
  it("opens a standard ZIP and verifies CRCs with Python's independent zipfile reader", () => {
    const bytes = zipArchive(
      [
        { path: "manifest.json", bytes: Buffer.from('{"version":1}') },
        {
          path: "data/example.json",
          bytes: Buffer.from(
            '[{"amount":"9007199254740993.00000001","net":null}]',
          ),
        },
      ],
      new Date("2026-10-13T00:00:00Z"),
    );
    const result = spawnSync(
      "python",
      [
        "-c",
        "import sys,io,zipfile,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; print(json.dumps({p:json.loads(z.read(p)) for p in z.namelist()}))",
      ],
      { input: bytes, encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data["data/example.json"][0].amount).toBe(
      "9007199254740993.00000001",
    );
    expect(data["data/example.json"][0].net).toBeNull();
    expect(() =>
      zipArchive([{ path: "../escape", bytes: Buffer.from("x") }], new Date()),
    ).toThrow();
  });
  it("backs up bytes, deduplicates objects and refuses silent missing-image archives", async () => {
    const id = "00000000-0000-4000-8000-000000000001",
      objectKey = `reviews/00000000-0000-4000-8000-000000000002/${id}`;
    const row = {
      id,
      object_key: objectKey,
      thumbnail_key: objectKey + "-thumb",
      state: "ready",
      mime: "image/png",
      bytes: 3,
    };
    const read = vi.fn(async () => Buffer.from("img"));
    const full = await backupImages(
      { review_attachments: [row, row] },
      true,
      false,
      read,
    );
    expect(read).toHaveBeenCalledTimes(2);
    expect(full.entries).toHaveLength(2);
    expect(full.files).toHaveLength(4);
    expect(full.missing).toHaveLength(0);
    await expect(
      backupImages({ review_attachments: [row] }, true, false, null),
    ).rejects.toBeInstanceOf(MissingImagesError);
    const partial = await backupImages(
      { review_attachments: [row] },
      true,
      true,
      null,
    );
    expect(partial.entries).toHaveLength(0);
    expect(partial.missing).toHaveLength(2);
    const metadata = await backupImages(
      { review_attachments: [row] },
      false,
      false,
      null,
    );
    expect(metadata.files[0].status).toBe("not-requested");
    await expect(
      backupImages(
        {
          review_attachments: [
            { ...row, object_key: "reviews/other-user/image" },
          ],
        },
        true,
        true,
        read,
      ),
    ).rejects.toThrow("ownership");
  });
  it("rejects production localhost without changing signup policy", () => {
    const config = {
      DATABASE_URL: "postgresql://user:placeholder@localhost/journal",
      BETTER_AUTH_SECRET: "x".repeat(32),
      BETTER_AUTH_URL: "http://localhost:3000",
    };
    expect(() => readConfig({ ...config, NODE_ENV: "production" })).toThrow();
    expect(
      readConfig({
        ...config,
        NODE_ENV: "production",
        BETTER_AUTH_URL: "https://journal.example.com",
      }).AUTH_REQUIRE_EMAIL_VERIFICATION,
    ).toBe("false");
  });
});
