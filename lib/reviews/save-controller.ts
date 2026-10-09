import type { ReviewData, ReviewFields } from "./model";
type Draft = { fields: ReviewFields; status: "draft" | "reviewed" };
export type SaveSnapshot = {
  draft: Draft;
  data: ReviewData;
  dirty: boolean;
  state: "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";
  error?: string;
};
const encoded = (draft: Draft) => JSON.stringify(draft);
/** Serialize saves, retain edits made during requests, and require explicit conflict resolution. */
export class ReviewSaveController {
  private listeners = new Set<() => void>();
  private pending: Promise<void> | null = null;
  private saved: string;
  private snapshot: SaveSnapshot;
  constructor(
    data: ReviewData,
    private persist: (draft: Draft, revision: number) => Promise<ReviewData>,
  ) {
    const draft = { fields: data.fields, status: data.status };
    this.saved = encoded(draft);
    this.snapshot = { draft, data, dirty: false, state: "idle" };
  }
  read = () => this.snapshot;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private update(patch: Partial<SaveSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  edit(draft: Draft) {
    this.update({
      draft,
      dirty: encoded(draft) !== this.saved,
      state:
        this.snapshot.state === "conflict"
          ? "conflict"
          : this.pending
            ? "saving"
            : "dirty",
      error:
        this.snapshot.state === "conflict" ? this.snapshot.error : undefined,
    });
  }
  accept(data: ReviewData) {
    if (this.snapshot.dirty || this.pending)
      throw new Error("Save the review before changing screenshots.");
    if (data.revision < this.snapshot.data.revision) return false;
    const draft = { fields: data.fields, status: data.status };
    this.saved = encoded(draft);
    this.update({
      data,
      draft,
      dirty: false,
      state: "saved",
      error: undefined,
    });
    return true;
  }
  useLatest(data: ReviewData) {
    this.pending = null;
    const draft = { fields: data.fields, status: data.status };
    this.saved = encoded(draft);
    this.update({
      draft,
      data,
      dirty: false,
      state: "saved",
      error: undefined,
    });
  }
  resolveWithMine(data: ReviewData) {
    this.update({ data, state: "dirty", error: undefined });
    return this.save();
  }
  save = (): Promise<void> => {
    if (this.pending) return this.pending;
    if (!this.snapshot.dirty || this.snapshot.state === "conflict")
      return Promise.resolve();
    const run = async () => {
      while (this.snapshot.dirty) {
        const draft = this.snapshot.draft,
          revision = this.snapshot.data.revision;
        this.update({ state: "saving", error: undefined });
        try {
          const data = await this.persist(draft, revision);
          this.saved = encoded(draft);
          const dirty = encoded(this.snapshot.draft) !== this.saved;
          this.update({ data, dirty, state: dirty ? "saving" : "saved" });
        } catch (e) {
          this.update({
            state:
              (e as { status?: number }).status === 409 ? "conflict" : "error",
            error:
              e instanceof Error
                ? e.message
                : "Save failed. Your edits are kept.",
          });
          break;
        }
      }
    };
    // Queue the work so reentrant listeners also see one pending request.
    this.pending = Promise.resolve()
      .then(run)
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  };
}
