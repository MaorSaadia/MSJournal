"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated private images must bypass shared image optimization. */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { requestJson } from "@/lib/client-api";
import { stages } from "@/lib/reviews/model";
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
}: {
  recordId: string;
  data: T;
  blocked: boolean;
  demo: boolean;
  changed: (data: T) => void;
  config?: GalleryConfig;
}) {
  const fileInput = useRef<HTMLInputElement>(null),
    guard = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState<File[]>([]),
    [view, setView] = useState<GalleryImage | null>(null),
    [zoom, setZoom] = useState(100),
    [remove, setRemove] = useState<GalleryImage | null>(null);
  const disabled = busy || blocked || demo || !data.storageEnabled;
  async function upload(files: File[]) {
    if (disabled || guard.current || !files.length) return;
    guard.current = true;
    setBusy(true);
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
      setBusy(false);
    }
  }
  async function order(index: number, step: number) {
    if (disabled || !data.id) return;
    setBusy(true);
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
      setBusy(false);
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
    if (!remove) return;
    setBusy(true);
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
      setBusy(false);
    }
  }
  return (
    <div className="review-screenshots">
      <header>
        <h2>Chart screenshots</h2>
        <p className="muted small">
          {config.playbook
            ? "Valid setups, invalid setups and management examples."
            : "Keep a visual reference before, during or after the trade."}
        </p>
      </header>
      {demo ? (
        <p className="review-setup">
          Demo screenshots are not provided. No private screenshots are shared.
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
            <strong>Drop chart images here</strong>
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
          {busy && <p role="status">Uploading or saving screenshot…</p>}
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
          <article key={image.id}>
            <button
              className="review-thumbnail"
              onClick={() => {
                setView(image);
                setZoom(100);
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
            setError("");
            try {
              await requestJson(`${config.endpoint}/cleanup`, {
                method: "POST",
              });
              await refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Cleanup unavailable.");
            }
          }}
        >
          Retry pending removal / clean abandoned uploads
        </button>
      )}
      <Dialog
        open={view !== null}
        onOpenChange={(open) => {
          if (!open) setView(null);
        }}
      >
        <DialogContent className="review-image-viewer">
          <DialogTitle>{view?.caption || "Chart screenshot"}</DialogTitle>
          <DialogDescription>
            Private image · zoom to inspect chart labels
          </DialogDescription>
          <label>
            Zoom {zoom}%
            <input
              type="range"
              aria-label="Screenshot zoom"
              min={50}
              max={300}
              step={25}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
          <div className="review-image-scroll">
            {view && (
              <img
                src={`${config.endpoint}/${view.id}`}
                alt={view.caption || "Full-size chart screenshot"}
                referrerPolicy="no-referrer"
                style={{ width: `${zoom}%`, maxWidth: "none" }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={remove !== null}
        onOpenChange={(open) => {
          if (!open) setRemove(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Remove this screenshot?</DialogTitle>
          <DialogDescription>
            The screenshot and its caption will be removed from this gallery.
          </DialogDescription>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setRemove(null)}
          >
            Keep screenshot
          </Button>
          <Button disabled={busy} onClick={() => void confirmRemove()}>
            Remove screenshot
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
        {busy
          ? "Saving…"
          : playbook
            ? "Save caption / example type"
            : "Save caption / stage"}
      </Button>
    </form>
  );
}
