"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated private images must bypass shared image optimization. */
import { useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Expand,
  ImagePlus,
  Trash2,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { requestJson } from "@/lib/client-api";
import { stages } from "@/lib/reviews/model";
import { ScreenshotViewer } from "./image-viewer";
export type GalleryImage = {
  id: string;
  caption: string;
  stage: string | null;
  position: number;
  width: number;
  height: number;
  revision: number;
};
export type GalleryData = {
  id: string | null;
  revision: number;
  storageEnabled: boolean;
  images: GalleryImage[];
};
type GalleryConfig = {
  endpoint: string;
  resourceEndpoint: string;
  uploadKey: string;
  ownerKey: string;
  kindChoices: readonly string[];
  playbook?: boolean;
};
const defaultConfig: GalleryConfig = {
  endpoint: "/api/reviews/screenshots",
  resourceEndpoint: "/api/reviews",
  uploadKey: "recordId",
  ownerKey: "reviewId",
  kindChoices: stages,
};
export function Screenshots<T extends GalleryData>({
  recordId,
  data,
  blocked,
  demo,
  changed,
  config = defaultConfig,
  layout = "gallery",
  onBusyChange,
}: {
  recordId: string;
  data: T;
  blocked: boolean;
  demo: boolean;
  changed: (data: T) => void;
  config?: GalleryConfig;
  layout?: "gallery" | "workspace";
  onBusyChange?: (busy: boolean) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null),
    guard = useRef(false);
  const [operation, setCurrentOperation] = useState<
      "upload" | "order" | "remove" | "cleanup" | null
    >(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState<File[]>([]),
    [view, setView] = useState<GalleryImage | null>(null),
    [remove, setRemove] = useState<GalleryImage | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [imageAttempt, setImageAttempt] = useState(0);
  const workspace = layout === "workspace";
  const active =
    data.images.find((image) => image.id === activeId) ??
    data.images[0] ??
    null;
  const activeIndex = data.images.findIndex((image) => image.id === active?.id);
  const setOperation = (value: typeof operation) => {
    setCurrentOperation(value);
    onBusyChange?.(value !== null);
  };
  const busy = operation !== null;
  const disabled = busy || blocked || demo || !data.storageEnabled;
  async function upload(files: File[]) {
    if (disabled || guard.current || !files.length) return;
    guard.current = true;
    setOperation("upload");
    setError("");
    const pending = [...files];
    try {
      if (data.images.length + files.length > 10)
        throw new Error("Choose up to 10 images per record.");
      while (pending.length) {
        const file = pending[0];
        if (file.size > 10 * 1024 * 1024)
          throw new Error("Maximum 10 MB per image.");
        const result = await requestJson<T>(
          `${config.endpoint}?${config.uploadKey}=${recordId}`,
          {
            method: "POST",
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
            body: file,
          },
        );
        changed(result);
        pending.shift();
      }
      setRetry([]);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Upload failed. The image is not attached.",
      );
      setRetry(pending);
    } finally {
      guard.current = false;
      setOperation(null);
    }
  }
  async function order(index: number, step: number) {
    if (disabled || guard.current || !data.id) return;
    guard.current = true;
    setOperation("order");
    setError("");
    try {
      const ids = data.images.map((i) => i.id);
      [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
      changed(
        await requestJson<T>(`${config.endpoint}/order`, {
          method: "POST",
          body: JSON.stringify({
            [config.ownerKey]: data.id,
            ids,
            revision: data.revision,
          }),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reorder.");
    } finally {
      guard.current = false;
      setOperation(null);
    }
  }
  async function refresh() {
    changed(
      await requestJson<T>(
        `${config.resourceEndpoint}?${config.playbook ? "id" : "recordId"}=${recordId}`,
      ),
    );
  }
  async function confirmRemove() {
    if (!remove || disabled || guard.current) return;
    guard.current = true;
    setOperation("remove");
    setError("");
    try {
      await requestJson(`${config.endpoint}/${remove.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmed: true }),
      });
      setRemove(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove image.");
      setRemove(null);
      await refresh().catch(() => {});
    } finally {
      guard.current = false;
      setOperation(null);
    }
  }
  return (
    <div
      aria-busy={busy}
      className={`review-screenshots ${workspace ? "review-chart-workspace" : ""} ${active ? "has-images" : ""}`}
    >
      <header>
        <h2>{workspace ? "Trade screenshots" : "Chart screenshots"}</h2>
        <p className="muted small">
          {config.playbook
            ? "Valid setups, invalid setups and management examples."
            : "Keep a visual reference before, during or after the trade."}
        </p>
      </header>
      {workspace && active && (
        <>
          <div className="review-chart-toolbar">
            <span>
              {active.caption || `Screenshot ${activeIndex + 1}`}
              {active.stage ? ` / ${active.stage} the trade` : ""}
            </span>
            <div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous screenshot"
                disabled={activeIndex <= 0}
                onClick={() => setActiveId(data.images[activeIndex - 1].id)}
              >
                <ChevronLeft size={16} />
              </Button>
              <span>
                {activeIndex + 1} / {data.images.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next screenshot"
                disabled={activeIndex >= data.images.length - 1}
                onClick={() => setActiveId(data.images[activeIndex + 1].id)}
              >
                <ChevronRight size={16} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="review-delete-image"
                aria-label="Delete selected screenshot"
                disabled={disabled}
                onClick={() => setRemove(active)}
              >
                <Trash2 size={15} />
                Delete
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Enlarge screenshot"
                onClick={() => {
                  setView(active);
                }}
              >
                <Expand size={16} />
              </Button>
            </div>
          </div>
          <div className="review-chart-stage">
            {failedImage === active.id ? (
              <div role="alert">
                <p>This screenshot could not load.</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setFailedImage(null);
                    setImageAttempt((n) => n + 1);
                  }}
                >
                  Retry image
                </Button>
              </div>
            ) : (
              <button
                className="review-chart-image"
                aria-label="Enlarge selected screenshot"
                onClick={() => {
                  setView(active);
                }}
              >
                <img
                  key={`${active.id}:${imageAttempt}`}
                  src={`${config.endpoint}/${active.id}?attempt=${imageAttempt}`}
                  alt={
                    active.caption ||
                    `Trade chart screenshot ${activeIndex + 1}`
                  }
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  onError={() => setFailedImage(active.id)}
                />
              </button>
            )}
          </div>
          <div
            className="review-chart-thumbnails"
            role="group"
            aria-label="Choose trade screenshot"
          >
            {data.images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                aria-label={`Select screenshot ${index + 1}`}
                aria-pressed={image.id === active.id}
                onClick={() => setActiveId(image.id)}
              >
                <img
                  src={`${config.endpoint}/${image.id}?thumbnail=1`}
                  alt={image.caption || `Screenshot ${index + 1}`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <span>{index + 1}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {busy && (
        <div className="review-media-pending" role="status" aria-live="polite">
          <span className="review-media-pending-icon">
            <LoadingSpinner size={20} />
          </span>
          <div>
            <strong>
              {operation === "upload"
                ? "Uploading screenshot"
                : operation === "remove"
                  ? "Deleting screenshot"
                  : operation === "order"
                    ? "Updating screenshot order"
                    : "Finishing screenshot cleanup"}
            </strong>
            <small>
              {operation === "upload"
                ? "Your image is being saved securely."
                : "Your changes are being saved."}
            </small>
          </div>
          <span className="review-media-pending-line" aria-hidden="true" />
        </div>
      )}
      <details
        className={
          workspace && active ? "review-chart-tools" : "review-gallery-tools"
        }
        open={workspace && active ? undefined : true}
      >
        <summary hidden={!workspace || !active}>Manage screenshots</summary>
        {demo ? (
          <p className="review-setup">
            Demo screenshots are not provided. No private screenshots are
            shared.
          </p>
        ) : !data.storageEnabled ? (
          <div className="review-setup" role="status">
            <h3>Private screenshot storage needs setup</h3>
            <p>
              Your written content remains available. Configure a private
              S3-compatible bucket using the README instructions.
            </p>
          </div>
        ) : (
          <>
            <div
              className="review-upload"
              tabIndex={0}
              role="group"
              aria-label="Screenshot upload area"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void upload(Array.from(e.dataTransfer.files));
              }}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files);
                if (files.length) {
                  e.preventDefault();
                  void upload(files);
                }
              }}
            >
              <ImagePlus size={24} aria-hidden="true" />
              <strong>
                {workspace && active
                  ? "Add another screenshot"
                  : "Drop your trade screenshot here"}
              </strong>
              <p>PNG, JPEG or WebP · 10 MB each · up to 10 images</p>
              <p className="small muted">Focus this area to paste an image.</p>
              <input
                ref={fileInput}
                aria-label="Chart screenshot files"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                disabled={disabled}
                onChange={(e) => {
                  void upload(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                disabled={disabled}
                onClick={() => fileInput.current?.click()}
              >
                Choose images
              </Button>
            </div>
            {blocked && (
              <p className="small muted">
                Save your writing before changing screenshots.
              </p>
            )}
          </>
        )}
        {error && (
          <div className="review-error" role="alert">
            <p>{error}</p>
            {retry.length > 0 && (
              <Button disabled={disabled} onClick={() => void upload(retry)}>
                Retry upload
              </Button>
            )}
          </div>
        )}
        <div className="review-image-grid">
          {data.images.map((image, index) => (
            <article
              key={image.id}
              hidden={workspace && image.id !== active?.id}
            >
              {!workspace && (
                <button
                  className="review-thumbnail"
                  onClick={() => {
                    setView(image);
                  }}
                  aria-label={`View screenshot ${index + 1}`}
                >
                  <img
                    src={`${config.endpoint}/${image.id}?thumbnail=1`}
                    alt={image.caption || `Chart screenshot ${index + 1}`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </button>
              )}
              <details
                className="review-image-options"
                open={workspace ? undefined : true}
              >
                <summary hidden={!workspace}>
                  Caption &amp; screenshot options
                </summary>
                <ImageMetadata
                  key={`${image.id}:${image.revision}`}
                  image={image}
                  endpoint={config.endpoint}
                  kindChoices={config.kindChoices}
                  playbook={config.playbook}
                  disabled={disabled}
                  saved={() =>
                    void refresh().catch(() =>
                      setError(
                        "Could not refresh screenshot metadata. Reload before editing again.",
                      ),
                    )
                  }
                  failed={setError}
                />
                <div className="review-image-actions">
                  <button
                    disabled={disabled || index === 0}
                    onClick={() => void order(index, -1)}
                  >
                    Move earlier
                  </button>
                  <button
                    disabled={disabled || index === data.images.length - 1}
                    onClick={() => void order(index, 1)}
                  >
                    Move later
                  </button>
                  <button disabled={disabled} onClick={() => setRemove(image)}>
                    Remove
                  </button>
                </div>
              </details>
            </article>
          ))}
        </div>
        {!demo && data.storageEnabled && !data.images.length && !busy && (
          <p className="muted">
            No screenshots yet. Add one whenever it helps your review.
          </p>
        )}
        {!demo && data.storageEnabled && (
          <button
            className="review-cleanup"
            disabled={disabled}
            onClick={async () => {
              if (disabled || guard.current) return;
              guard.current = true;
              setOperation("cleanup");
              setError("");
              try {
                await requestJson(`${config.endpoint}/cleanup`, {
                  method: "POST",
                });
                await refresh();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Cleanup unavailable.",
                );
              } finally {
                guard.current = false;
                setOperation(null);
              }
            }}
          >
            Retry pending removal / clean abandoned uploads
          </button>
        )}
      </details>
      <ScreenshotViewer
        key={view?.id ?? "closed"}
        image={view}
        endpoint={config.endpoint}
        onClose={() => setView(null)}
      />
      <Dialog
        open={remove !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setRemove(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Delete this screenshot?</DialogTitle>
          <DialogDescription>
            The screenshot and its caption will be removed from this gallery.
          </DialogDescription>
          {remove && (
            <img
              className="review-remove-preview"
              src={`${config.endpoint}/${remove.id}?thumbnail=1`}
              alt={remove.caption || "Screenshot selected for deletion"}
              referrerPolicy="no-referrer"
            />
          )}
          <Button
            variant="outline"
            disabled={busy}
            aria-busy={busy}
            onClick={() => setRemove(null)}
          >
            Keep screenshot
          </Button>
          <Button
            variant="destructive"
            disabled={busy || blocked}
            aria-busy={busy}
            onClick={() => void confirmRemove()}
          >
            {operation === "remove" ? (
              <>
                <LoadingSpinner />
                Deleting
              </>
            ) : (
              "Delete screenshot"
            )}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function ImageMetadata({
  image,
  disabled,
  saved,
  failed,
  endpoint,
  kindChoices,
  playbook,
}: {
  image: GalleryImage;
  endpoint: string;
  kindChoices: readonly string[];
  playbook?: boolean;
  disabled: boolean;
  saved: () => void;
  failed: (message: string) => void;
}) {
  const [caption, setCaption] = useState(image.caption),
    [stage, setStage] = useState(image.stage ?? ""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await requestJson(`${endpoint}/${image.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              revision: image.revision,
              caption,
              stage: stage || null,
            }),
          });
          saved();
        } catch (e) {
          failed(e instanceof Error ? e.message : "Caption save failed.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Caption
        <input
          aria-label="Screenshot caption"
          value={caption}
          maxLength={500}
          disabled={disabled || busy}
          onChange={(e) => setCaption(e.target.value)}
        />
      </label>
      <label>
        {playbook ? "Example type" : "Stage"}
        <select
          aria-label={playbook ? "Example type" : "Screenshot stage"}
          value={stage}
          disabled={disabled || busy}
          onChange={(e) => setStage(e.target.value)}
        >
          <option value="">Not specified</option>
          {kindChoices.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <Button
        variant="outline"
        disabled={
          disabled ||
          busy ||
          (caption === image.caption && stage === (image.stage ?? ""))
        }
      >
        {busy ? (
          <>
            <LoadingSpinner size={14} />
            Saving
          </>
        ) : playbook ? (
          "Save caption / example type"
        ) : (
          "Save caption / stage"
        )}
      </Button>
    </form>
  );
}
