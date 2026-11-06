"use client";

import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"; // copied by scripts/copy-pdf-worker.mjs
  return pdfjs;
}

/** Page count of a PDF, or null if it cannot be opened. */
export async function countPdfPages(data: ArrayBuffer): Promise<number | null> {
  try {
    const pdfjs = await loadPdfJs();
    const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
    const doc = await task.promise;
    const n = doc.numPages;
    await task.destroy();
    return n;
  } catch {
    return null;
  }
}

type Loaded = { file: Blob; doc: PDFDocumentProxy | null; error: string | null };

/** Page-by-page PDF viewer for drawings. Rendering happens entirely in the browser. */
export function PdfViewer({ file, page, onPageChange }: { file: Blob; page: number; onPageChange: (page: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [renderedKey, setRenderedKey] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  // State from a previous file is ignored rather than reset inside the effect.
  const current = loaded?.file === file ? loaded : null;
  const doc = current?.doc ?? null;
  const error = current?.error ?? renderError;

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const data = new Uint8Array(await file.arrayBuffer());
        if (cancelled) return;
        task = pdfjs.getDocument({ data });
        const pdf = await task.promise;
        if (!cancelled) setLoaded({ file, doc: pdf, error: null });
      } catch {
        if (!cancelled) setLoaded({ file, doc: null, error: "This PDF could not be opened. It may be damaged or password-protected." });
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [file]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pageNo = doc ? Math.min(Math.max(1, page), doc.numPages) : page;
  const renderKey = `${pageNo}:${width}:${zoom}`;

  useEffect(() => {
    if (!doc || !canvasRef.current || width === 0) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    (async () => {
      try {
        const pdfPage = await doc.getPage(pageNo);
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: ((width - 2) / base.width) * zoom });
        const ratio = window.devicePixelRatio || 1;
        const canvas = canvasRef.current!;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        task = pdfPage.render({ canvas, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
        await task.promise;
        if (!cancelled) {
          setRenderError(null);
          setRenderedKey(`${pageNo}:${width}:${zoom}`);
        }
      } catch (e) {
        if (!cancelled && !(e instanceof Error && e.name === "RenderingCancelledException")) setRenderError("This page could not be rendered.");
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNo, width, zoom]);

  const total = doc?.numPages ?? 0;
  const go = (p: number) => total > 0 && onPageChange(Math.min(Math.max(1, p), total));
  const busy = !doc || renderedKey !== renderKey;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b bg-background px-2 py-1.5">
        <Button variant="ghost" size="icon-sm" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Page
          <input
            className="h-7 w-12 rounded border bg-background px-1 text-center text-sm text-foreground tabular-nums"
            type="number"
            min={1}
            max={total || undefined}
            value={page}
            onChange={(e) => go(Number(e.target.value))}
            aria-label="Page number"
          />
          of {total || "…"}
        </label>
        <Button variant="ghost" size="icon-sm" onClick={() => go(page + 1)} disabled={total === 0 || page >= total} aria-label="Next page">
          <ChevronRight />
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out">
            <Minus />
          </Button>
          <button type="button" className="w-12 text-xs tabular-nums text-muted-foreground hover:text-foreground" onClick={() => setZoom(1)} title="Fit width">
            {Math.round(zoom * 100)}%
          </button>
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} aria-label="Zoom in">
            <Plus />
          </Button>
        </div>
      </div>
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-auto bg-neutral-200 dark:bg-neutral-900">
        {error ? (
          <p className="p-6 text-sm text-destructive">{error}</p>
        ) : (
          <>
            {busy && <p className="absolute top-2 left-2 rounded bg-background/90 px-2 py-1 text-xs text-muted-foreground">Rendering…</p>}
            <canvas ref={canvasRef} className="mx-auto block bg-white shadow" aria-label={`PDF page ${pageNo}`} />
          </>
        )}
      </div>
    </div>
  );
}
