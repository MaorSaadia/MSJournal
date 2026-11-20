import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ reserve: vi.fn(), accept: vi.fn(), send: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("resend", () => ({ Resend: class { emails = { send: mock.send }; } }));
vi.mock("@/lib/contact/reservations", () => ({ reserveSubmission: mock.reserve, markAccepted: mock.accept }));

import { POST } from "@/app/api/contact/route";

const origin = "https://msjournal.example";
const form = () => ({ id: `${Date.now()}:${crypto.randomUUID()}`, topic: "billing", email: "guest@example.com", message: "My <payment> needs a review.", receipt: "receipt-example", website: "" });
function submit(payload: ReturnType<typeof form>) {
  return POST(new Request(`${origin}/api/contact`, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }));
}

beforeEach(() => {
  mock.reserve.mockReset().mockResolvedValue("send");
  mock.accept.mockReset().mockResolvedValue(true);
  mock.send.mockReset().mockResolvedValue({ data: { id: "fixture" }, error: null });
  vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(32));
  vi.stubEnv("BETTER_AUTH_URL", origin);
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/fixture");
  vi.stubEnv("RESEND_API_KEY", "fixture-key");
  vi.stubEnv("AUTH_EMAIL_FROM", "MSJournal <verified@example.com>");
  vi.stubEnv("SUPPORT_INBOX_EMAIL", "inbox@example.com");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("contact submission", () => {
  it("lets a guest send a request and routes replies in both directions", async () => {
    const input = form();
    const response = await submit(input);
    expect(response.status).toBe(200);
    const { reference } = await response.json();
    expect(reference).toMatch(/^MSJ-/);
    const [[support, key], [visitor]] = mock.send.mock.calls;
    expect(support).toMatchObject({ from: "MSJournal <verified@example.com>", to: "inbox@example.com", replyTo: input.email, subject: `[MSJournal Support] Billing · ${reference}` });
    expect(key.idempotencyKey).toBe(`contact-support/${input.id}`);
    expect(support.html).toContain("&lt;payment&gt;");
    expect(support.text).toContain(input.message);
    expect(visitor).toMatchObject({ to: input.email, replyTo: "inbox@example.com", subject: `We received your MSJournal message · ${reference}` });
    expect(visitor.html + visitor.text).not.toContain(input.receipt);
    expect(visitor.html + visitor.text).not.toContain("needs a review");
    mock.reserve.mockResolvedValue("accepted");
    expect(await (await submit(input)).json()).toEqual({ reference });
    expect(mock.send).toHaveBeenCalledTimes(2);
  });

  it("permits a safe retry after failure and preserves success if confirmation fails", async () => {
    const input = form();
    mock.send.mockResolvedValueOnce({ error: {}, data: null });
    const failure = await submit(input);
    expect(failure.status).toBe(503);
    expect(await failure.json()).not.toHaveProperty("reference");
    expect(mock.accept).not.toHaveBeenCalled();
    mock.send.mockResolvedValueOnce({ data: { id: "fixture" } }).mockRejectedValueOnce(new Error("confirmation failed"));
    expect((await submit(input)).status).toBe(200);
    expect(mock.send.mock.calls[0][1].idempotencyKey).toBe(mock.send.mock.calls[1][1].idempotencyKey);
  });

  it("blocks honeypot submissions and rate-limited requests before delivery", async () => {
    expect((await submit({ ...form(), website: "filled" })).status).toBe(400);
    mock.reserve.mockResolvedValue("limited");
    expect((await submit(form())).status).toBe(429);
    expect(mock.send).not.toHaveBeenCalled();
  });
});
