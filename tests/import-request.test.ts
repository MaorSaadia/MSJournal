import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("server-only", () => ({}));
import { readUpload } from "@/lib/imports/request";
import { csv, performance } from "./fixtures/tradovate";
function form() {
  const body = new FormData();
  body.set("accountId", randomUUID());
  body.set("timezone", "Asia/Jerusalem");
  body.set("confirmPerformance", "true");
  body.set(
    "performance",
    new File([csv("performance", [performance()])], "misleading-orders.csv"),
  );
  return body;
}
const request = (body: FormData) =>
  new Request("http://localhost/api/imports/preview", { method: "POST", body });
describe("bounded server upload input", () => {
  it("parses actual files and ignores filename claims", async () => {
    const result = await readUpload(request(form()));
    expect(result.files[0].type).toBe("performance");
    expect(result.files[0].rows).toHaveLength(1);
  });
  it("rejects client identities, repeated fields, oversized requests and malformed multipart", async () => {
    const forged = form();
    forged.set("userId", "another-user");
    await expect(readUpload(request(forged))).rejects.toThrow("Unexpected");
    const repeated = form();
    repeated.append("performance", new File(["fake"], "fake.csv"));
    await expect(readUpload(request(repeated))).rejects.toThrow("repeated");
    await expect(
      readUpload(
        new Request("http://localhost/", {
          method: "POST",
          headers: {
            "content-type": "multipart/form-data; boundary=fake",
            "content-length": String(12 * 1024 * 1024),
          },
          body: "fake",
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      readUpload(
        new Request("http://localhost/", {
          method: "POST",
          headers: { "content-type": "multipart/form-data; boundary=fake" },
          body: "not a multipart form",
        }),
      ),
    ).rejects.toThrow("Malformed upload");
  });
});
