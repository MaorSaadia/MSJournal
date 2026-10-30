import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import sharp from "sharp";
import {
  emptyFields,
  reviewFieldsSchema,
  reviewState,
  unchangedAssociation,
  type ReviewData,
} from "@/lib/reviews/model";
import { ReviewSaveController } from "@/lib/reviews/save-controller";
import { validatedImage, readBounded } from "@/lib/reviews/images";
const initial = (): ReviewData => ({
  userId: "fixture",
  timezone: "Asia/Jerusalem",
  id: null,
  recordId: "fixture",
  revision: 0,
  status: "draft",
  fields: emptyFields(),
  tags: [],
  images: [],
  storageEnabled: false,
  needsReassignment: false,
});
describe("review saves and image validation", () => {
  it("accepts bounded custom emotions, canonicalizes built-ins and rejects invalid labels", () => {
    const fields = {
      ...emptyFields(),
      emotions: {
        before: [" Patient ", "patient", "calm"],
        during: [],
        after: [],
      },
    };
    expect(reviewFieldsSchema.parse(fields).emotions.before).toEqual([
      "Patient",
      "Calm",
    ]);
    for (const invalid of ["   ", "x".repeat(61), "Calm\nFocused"]) {
      expect(
        reviewFieldsSchema.safeParse({
          ...fields,
          emotions: { ...fields.emotions, before: [invalid] },
        }).success,
      ).toBe(false);
    }
    expect(
      reviewFieldsSchema.safeParse({
        ...fields,
        emotions: {
          ...fields.emotions,
          before: Array.from({ length: 31 }, (_, i) => `Mood ${i}`),
        },
      }).success,
    ).toBe(false);
  });

  it("ignores an older restored read after a newer save was confirmed", async () => {
    const c = new ReviewSaveController(initial(), async (draft, revision) => ({
      ...initial(),
      ...draft,
      revision: revision + 1,
    }));
    c.edit({
      fields: { ...emptyFields(), lesson: "Newest saved reflection" },
      status: "draft",
    });
    await c.save();
    expect(c.accept(initial())).toBe(false);
    expect(c.read().draft.fields.lesson).toBe("Newest saved reflection");
    expect(c.read().data.revision).toBe(1);
  });
  it("serializes rapid edits without overwriting new paragraphs with a stale response", async () => {
    let finish!: (value: ReviewData) => void;
    const persist = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<ReviewData>((resolve) => {
            finish = resolve;
          }),
      )
      .mockImplementation(async (draft, revision) => ({
        ...initial(),
        ...draft,
        revision: revision + 1,
      }));
    const controller = new ReviewSaveController(initial(), persist);
    const first = {
      ...emptyFields(),
      lesson: "First paragraph\n\nSecond paragraph",
    };
    controller.edit({ fields: first, status: "draft" });
    const pending = controller.save();
    await Promise.resolve();
    const latest = { ...first, lesson: first.lesson + "\nNewest edit" };
    controller.edit({ fields: latest, status: "draft" });
    expect(controller.save()).toBe(pending);
    finish({ ...initial(), fields: first, revision: 1 });
    await pending;
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[1][1]).toBe(1);
    expect(controller.read().draft.fields.lesson).toBe(latest.lesson);
    expect(controller.read().dirty).toBe(false);
    expect(controller.read().state).toBe("saved");
  });
  it("keeps unsaved text after failure and requires an explicit revision choice after conflict", async () => {
    const persist = vi
      .fn()
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockRejectedValueOnce(
        Object.assign(new Error("Changed"), { status: 409 }),
      )
      .mockImplementation(async (draft, revision) => ({
        ...initial(),
        ...draft,
        revision: revision + 1,
      }));
    const c = new ReviewSaveController(initial(), persist),
      fields = { ...emptyFields(), lesson: "Keep this reflection" };
    c.edit({ fields, status: "draft" });
    await c.save();
    expect(c.read().state).toBe("error");
    expect(c.read().draft.fields.lesson).toBe(fields.lesson);
    await c.save();
    expect(c.read().state).toBe("conflict");
    await c.save();
    expect(persist).toHaveBeenCalledTimes(2);
    await c.resolveWithMine({ ...initial(), revision: 5 });
    expect(persist.mock.calls[2][1]).toBe(5);
    expect(c.read().state).toBe("saved");
  });
  it("keeps optional fields and reviewed state independent from profit", () => {
    expect(reviewState(emptyFields(), "draft")).toBe("unreviewed");
    expect(reviewState(emptyFields(), "reviewed")).toBe("reviewed");
    expect(reviewState(emptyFields(), "draft", 1)).toBe("draft");
    expect(
      reviewFieldsSchema.parse({ ...emptyFields(), management: "a\n\nb" })
        .management,
    ).toBe("a\n\nb");
    expect(
      reviewFieldsSchema.safeParse({
        ...emptyFields(),
        lesson: "x".repeat(5001),
      }).success,
    ).toBe(false);
    expect(
      unchangedAssociation(["a", "b"], [{ id: "kept", sourceIds: ["b", "a"] }]),
    ).toBe("kept");
    expect(
      unchangedAssociation(
        ["a", "b"],
        [
          { id: "split", sourceIds: ["a"] },
          { id: "split2", sourceIds: ["b"] },
        ],
      ),
    ).toBeNull();
    expect(
      unchangedAssociation(["a"], [{ id: "merged", sourceIds: ["a", "b"] }]),
    ).toBeNull();
  });
  it.each(["png", "jpeg", "webp"] as const)(
    "decodes real %s bytes and strips metadata while retaining a detailed image",
    async (format) => {
      const bytes = await sharp({
        create: {
          width: 1600,
          height: 1000,
          channels: 3,
          background: "#12635c",
        },
      })
        .toFormat(format)
        .toBuffer();
      const image = await validatedImage(bytes);
      expect(image.width).toBe(1600);
      expect(image.height).toBe(1000);
      expect((await sharp(image.thumbnail).metadata()).width).toBe(1200);
      expect((await sharp(image.full).metadata()).format).toBe(format);
      expect(image.mime).toBe(
        format === "jpeg" ? "image/jpeg" : `image/${format}`,
      );
    },
  );
  it("rejects oversized bodies, SVG, malformed and over-dimensioned images", async () => {
    await expect(
      validatedImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).rejects.toThrow();
    await expect(
      validatedImage(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])),
    ).rejects.toThrow();
    const huge = await sharp({
      create: { width: 16001, height: 1, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await expect(validatedImage(huge)).rejects.toThrow();
    await expect(validatedImage(Buffer.alloc(10485761))).rejects.toThrow();
    await expect(
      readBounded(
        new Request("http://localhost", {
          method: "POST",
          body: Buffer.alloc(100),
        }),
        50,
      ),
    ).rejects.toThrow();
  });
});
