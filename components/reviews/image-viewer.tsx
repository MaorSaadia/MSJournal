"use client";
/* eslint-disable @next/next/no-img-element -- Private images bypass shared optimization. */
import { useLayoutEffect, useRef, useState } from "react";
import { Minus, Plus, Scan, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { GalleryImage } from "./screenshots";

export function ScreenshotViewer({
  image,
  endpoint,
  onClose,
}: {
  image: GalleryImage | null;
  endpoint: string;
  onClose: () => void;
}) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  useLayoutEffect(() => {
    if (!viewport) return;
    const observe = () =>
      setSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    observe();
    const observer = new ResizeObserver(observe);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewport]);
  if (!image) return null;
  const fit = Math.min(
    (size.width - 32) / image.width,
    (size.height - 32) / image.height,
    1,
  );
  const scale = zoom ?? Math.max(0.01, fit);
  const changeZoom = (delta: number) =>
    setZoom(Math.max(0.1, Math.min(4, scale + delta)));
  const fitScreen = () => {
    setZoom(null);
    viewport?.scrollTo(0, 0);
  };
  const canPan =
    image.width * scale > size.width || image.height * scale > size.height;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="review-image-viewer review-lightbox">
        <header className="review-lightbox-header">
          <div>
            <DialogTitle>{image.caption || "Chart screenshot"}</DialogTitle>
            <DialogDescription>
              Private screenshot
              {image.stage ? ` / ${image.stage} the trade` : ""}
            </DialogDescription>
          </div>
        </header>
        <div
          className="review-lightbox-toolbar"
          role="group"
          aria-label="Screenshot viewing controls"
        >
          <Button
            variant={zoom === null ? "secondary" : "ghost"}
            size="sm"
            onClick={fitScreen}
          >
            <Scan size={15} />
            Fit screen
          </Button>
          <Button
            variant={zoom === 1 ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setZoom(1)}
          >
            <ImageIcon size={15} />
            Actual size
          </Button>
          <span className="review-zoom-divider" />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom out"
            disabled={scale <= 0.1}
            onClick={() => changeZoom(-0.25)}
          >
            <Minus size={16} />
          </Button>
          <output aria-live="polite" aria-label="Screenshot zoom level">
            {Math.round(scale * 100)}%
          </output>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom in"
            disabled={scale >= 4}
            onClick={() => changeZoom(0.25)}
          >
            <Plus size={16} />
          </Button>
        </div>
        <div
          ref={setViewport}
          className={`review-lightbox-viewport ${canPan ? "can-pan" : ""} ${dragging ? "is-dragging" : ""}`}
          tabIndex={0}
          role="region"
          aria-label="Zoomable trade screenshot"
          onKeyDown={(event) => {
            if (["+", "=", "-", "0", "1"].includes(event.key)) {
              event.preventDefault();
              if (event.key === "0") fitScreen();
              else if (event.key === "1") setZoom(1);
              else changeZoom(event.key === "-" ? -0.25 : 0.25);
            }
          }}
          onPointerDown={(event) => {
            if (
              !canPan ||
              event.pointerType !== "mouse" ||
              event.button !== 0 ||
              !viewport ||
              failed
            )
              return;
            event.preventDefault();
            viewport.focus();
            viewport.setPointerCapture(event.pointerId);
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              left: viewport.scrollLeft,
              top: viewport.scrollTop,
            };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (start && viewport) {
              event.currentTarget.scrollTo({
                left: start.left - (event.clientX - start.x),
                top: start.top - (event.clientY - start.y),
              });
            }
          }}
          onPointerUp={() => {
            drag.current = null;
            setDragging(false);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
          onLostPointerCapture={() => {
            drag.current = null;
            setDragging(false);
          }}
        >
          {failed ? (
            <div className="review-lightbox-error" role="alert">
              <p>The screenshot could not load.</p>
              <Button
                variant="outline"
                onClick={() => {
                  setFailed(false);
                  setAttempt((n) => n + 1);
                }}
              >
                Retry image
              </Button>
            </div>
          ) : (
            <div
              className="review-lightbox-plane"
              style={{
                width: Math.max(size.width, image.width * scale + 32),
                height: Math.max(size.height, image.height * scale + 32),
              }}
            >
              <img
                src={`${endpoint}/${image.id}?viewer=${attempt}`}
                alt={image.caption || "Full-size chart screenshot"}
                referrerPolicy="no-referrer"
                draggable={false}
                onError={() => setFailed(true)}
                style={{
                  width: image.width * scale,
                  height: image.height * scale,
                  visibility:
                    size.width > 0 && size.height > 0 ? "visible" : "hidden",
                }}
              />
            </div>
          )}
        </div>
        <footer>
          Drag to pan when zoomed <span aria-hidden="true">·</span> + / − to
          zoom <span aria-hidden="true">·</span> 0 to fit
        </footer>
      </DialogContent>
    </Dialog>
  );
}
