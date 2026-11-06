"use client";

import { FileText, Loader2, RotateCcw, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Pill } from "@/components/common/badges";
import { EmptyState } from "@/components/common/page-header";
import { countPdfPages } from "@/components/pdf/pdf-viewer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalysisRun, DocumentRef, ProjectType } from "@/domain/schemas";
import { PROJECT_TYPE_LABELS } from "@/domain/quotation";
import { findReferenceDocument } from "@/domain/reference-data/documents";
import { requestAnalysis, startAnalysisJob } from "@/lib/analysis-client";
import { failAnalysisRun, importAnalysisResult } from "@/lib/analysis-import";
import { sha256Hex } from "@/lib/demo/docs-db";
import { newId } from "@/lib/ids";
import { appStore } from "@/lib/store";
import { useCanEdit, useSystemStatus } from "@/lib/store/hooks";
import { formatBytes, formatDate } from "@/lib/format";
import { referenceExtraction } from "@/lib/reference-extraction";
import type { StepProps } from "../workspace";

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

/** Real elapsed time since `startedAt` (not a fake progress estimate). */
function useElapsed(startedAt: number | null) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (startedAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  return startedAt === null || now === 0 ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
}

const formatElapsed = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)} min ${s % 60}s`);

export function DocumentsStep({ estimate, update, goTo }: StepProps) {
  const status = useSystemStatus();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Demo mode: the document whose analysis this page is waiting for.
  const [analysing, setAnalysing] = useState<string | null>(null);
  // The analysis in progress. In connected mode it runs in the background, so it is read from the
  // stored runs (it survives a reload); in demo mode only the request this page started counts.
  const activeRun = estimate.analysisRuns.find(
    (r) => r.provider === "anthropic" && r.status === "running" && (appStore.mode === "supabase" || r.documentId === analysing),
  );
  const elapsed = useElapsed(activeRun ? new Date(activeRun.startedAt).getTime() : null);
  const maxBytes = status?.maxPdfBytes ?? DEFAULT_MAX_BYTES;
  const aiEnabled = status?.ai.enabled ?? false;
  const canEdit = useCanEdit();

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > maxBytes) {
          toast.error(`${file.name}: larger than ${formatBytes(maxBytes)}.`);
          continue;
        }
        const data = await file.arrayBuffer();
        const head = new TextDecoder().decode(new Uint8Array(data.slice(0, 5)));
        if (head !== "%PDF-") {
          toast.error(`${file.name}: not a PDF file.`);
          continue;
        }
        const sha256 = await sha256Hex(data);
        if (estimate.documents.some((d) => d.sha256 === sha256)) {
          toast.info(`${file.name} is already attached to this estimate.`);
          continue;
        }
        const pageCount = await countPdfPages(data);
        if (pageCount === null) {
          toast.error(`${file.name}: the PDF could not be opened (damaged or password-protected).`);
          continue;
        }
        const reference = findReferenceDocument(sha256);
        const doc: DocumentRef = {
          id: newId(),
          fileName: file.name,
          sha256,
          sizeBytes: file.size,
          pageCount,
          uploadedAt: new Date().toISOString(),
          storage: appStore.mode === "supabase" ? "supabase" : "browser",
        };
        await appStore.putDocument(estimate.id, doc, file);
        // Demo samples cite their reference file as "ref-<key>"; point those citations at the upload.
        const sampleRef = reference ? `ref-${reference.key}` : null;
        const attached = update((e) => ({
          ...e,
          documents: [...e.documents, doc],
          costing: {
            ...e.costing,
            measurements: e.costing.measurements.map((m) => (sampleRef && m.sourceDocumentId === sampleRef ? { ...m, sourceDocumentId: doc.id } : m)),
          },
        }));
        if (attached) toast.success(`${file.name} attached (${pageCount} pages)`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function analyse(doc: DocumentRef, force: boolean) {
    const runId = newId();
    const run: AnalysisRun = {
      id: runId, documentId: doc.id, provider: "anthropic", model: status?.ai.model ?? null, status: "running",
      startedAt: new Date().toISOString(), completedAt: null, error: null, summary: null, projectTypeSuggestion: null, measurementCount: 0,
    };

    if (appStore.mode === "supabase") {
      // Connected mode: a background job reads the file from Storage, so the analysis survives
      // leaving the page. The workspace imports the result when it is ready (useAnalysisJobs).
      update((e) => ({ ...e, analysisRuns: [...e.analysisRuns, run] }), { contentEdit: false });
      // The server reads the stored document record, so make sure the upload's save has landed.
      await appStore.whenSaved(estimate.id);
      const started = await startAnalysisJob({ jobId: runId, estimateId: estimate.id, documentId: doc.id, force });
      if (!started.ok) {
        update(failAnalysisRun(runId, started.message), { contentEdit: false });
        toast.error(started.message);
      } else if (started.status === "queued") {
        toast.info("Analysis started. It runs in the background: you can keep working or leave this page.");
      }
      return;
    }

    // Demo mode: the browser uploads its copy of the file and waits for the result.
    const file = await appStore.getDocumentFile(estimate.id, doc.id);
    if (!file) return toast.error("The file is not stored in this browser. Upload it again.");
    update((e) => ({ ...e, analysisRuns: [...e.analysisRuns, run] }), { contentEdit: false });
    setAnalysing(doc.id);
    const response = await requestAnalysis(file, doc.fileName, doc.pageCount, force);
    setAnalysing(null);
    if (!response.ok) {
      update(failAnalysisRun(runId, response.message), { contentEdit: false });
      toast.error(response.message);
      return;
    }
    update(importAnalysisResult(runId, doc.id, response));
    toast.success(`${response.result.measurements.length} measurements extracted${response.cached ? " (cached result)" : ""}. Review them before use.`);
    goTo("review");
  }

  function loadReference(doc: DocumentRef) {
    const reference = findReferenceDocument(doc.sha256);
    if (!reference) return;
    const alreadyLoaded =
      estimate.analysisRuns.some((r) => r.documentId === doc.id && r.provider === "reference_analysis") ||
      estimate.costing.measurements.some((m) => m.sourceDocumentId === doc.id && m.origin === "reference_analysis");
    if (alreadyLoaded) return toast.info("The reference extraction is already loaded in this estimate.");
    const toAdd = referenceExtraction(reference.key, doc.id, newId);
    const at = new Date().toISOString();
    update((e) => ({
      ...e,
      costing: { ...e.costing, measurements: [...e.costing.measurements, ...toAdd] },
      analysisRuns: [...e.analysisRuns, { id: newId(), documentId: doc.id, provider: "reference_analysis", model: null, status: "awaiting_review", startedAt: at, completedAt: at, error: null, summary: "Developer-prepared reference extraction (docs/reference-document-analysis.md). Not AI output.", projectTypeSuggestion: null, measurementCount: toAdd.length }],
    }));
    toast.success(`${toAdd.length} reference measurements loaded (not AI output).`);
    goTo("review");
  }

  function removeDocument(doc: DocumentRef) {
    const linked = estimate.costing.measurements.filter((m) => m.sourceDocumentId === doc.id).length;
    if (!window.confirm(`Remove ${doc.fileName}?${linked ? ` ${linked} measurement(s) cite it; they will be kept but their source page can no longer be viewed.` : ""}`)) return;
    if (update((e) => ({ ...e, documents: e.documents.filter((d) => d.id !== doc.id) }))) {
      void appStore.removeDocumentFile(estimate.id, doc.id);
    }
  }

  const applyProjectType = (t: ProjectType) => update((e) => ({ ...e, project: { ...e.project, projectType: t } }));

  return (
    <div className="grid gap-6 p-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Design documents</CardTitle>
            <CardDescription>
              PDF only, up to {formatBytes(maxBytes)} each.{" "}
              {appStore.mode === "supabase"
                ? "Files are stored in your organisation's private storage; they are sent to the AI service only when you start an analysis."
                : "In demo mode files stay in this browser; they are sent to the AI service only when you start an analysis."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canEdit && (
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void handleFiles(e.dataTransfer.files);
              }}
            >
              <Upload className="size-5 text-muted-foreground" aria-hidden />
              <p className="text-sm">Drag PDFs here, or</p>
              <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="sr-only" id="pdf-upload" onChange={(e) => void handleFiles(e.target.files)} />
              <Button variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
                {uploading ? <Loader2 className="animate-spin" /> : <Upload />} Choose files
              </Button>
            </div>
            )}

            {estimate.documents.length === 0 ? (
              <EmptyState title="No documents yet">Upload the client&apos;s design PDF (renderings, plans, elevations).</EmptyState>
            ) : (
              <ul className="divide-y rounded-lg border">
                {estimate.documents.map((doc) => {
                  const reference = findReferenceDocument(doc.sha256);
                  const runs = estimate.analysisRuns.filter((r) => r.documentId === doc.id);
                  const lastRun = runs.at(-1);
                  const analysedByAi = runs.some((r) => r.provider === "anthropic" && r.status === "awaiting_review");
                  const isRunning = activeRun?.documentId === doc.id;
                  return (
                    <li key={doc.id} className="space-y-2 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{doc.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              {doc.pageCount} pages · {formatBytes(doc.sizeBytes)} · uploaded {formatDate(doc.uploadedAt)} · SHA-256 {doc.sha256.slice(0, 12)}…
                            </p>
                            {reference && <Pill className="mt-1">Recognised reference document ({reference.key.toUpperCase()})</Pill>}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => goTo("review")}>
                            View pages
                          </Button>
                          {canEdit && aiEnabled && (
                            <Button
                              size="sm"
                              disabled={activeRun !== undefined}
                              onClick={() => {
                                if (analysedByAi && !window.confirm("This document has already been analysed. Re-running sends it to the AI service again and adds a new set of measurements. Continue?")) return;
                                void analyse(doc, analysedByAi);
                              }}
                            >
                              {isRunning ? <Loader2 className="animate-spin" /> : analysedByAi ? <RotateCcw /> : <Sparkles />}
                              {analysedByAi ? "Re-run AI analysis" : "Analyse with AI"}
                            </Button>
                          )}
                          {canEdit && reference && (
                            <Button size="sm" variant={aiEnabled ? "outline" : "default"} onClick={() => loadReference(doc)}>
                              Load reference extraction (not AI)
                            </Button>
                          )}
                          {canEdit && (
                            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${doc.fileName}`} onClick={() => removeDocument(doc)}>
                              <Trash2 />
                            </Button>
                          )}
                        </div>
                      </div>
                      {isRunning && (
                        <p className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm" role="status">
                          <Loader2 className="size-4 animate-spin" aria-hidden /> Analysing pages with {activeRun?.model ?? status?.ai.model ?? "the AI service"}… {formatElapsed(elapsed)} elapsed.{" "}
                          {appStore.mode === "supabase"
                            ? "Large drawing sets take several minutes. This runs in the background: you can keep working or leave this page."
                            : "Large drawing sets can take several minutes."}
                        </p>
                      )}
                      {lastRun && !isRunning && (
                        <div className="rounded-md bg-muted/60 px-3 py-2 text-xs">
                          <span className="font-medium">
                            {lastRun.status === "failed" ? "Analysis failed" : lastRun.status === "running" ? "Analysis interrupted" : "Awaiting review"}
                          </span>
                          {" · "}
                          {lastRun.provider === "anthropic" ? `AI (${lastRun.model ?? "unknown model"})` : "Reference analysis, not AI"}
                          {lastRun.completedAt && ` · ${formatDate(lastRun.completedAt)}`}
                          {lastRun.status === "awaiting_review" && ` · ${lastRun.measurementCount} measurements`}
                          {lastRun.error && <p className="mt-1 text-destructive">{lastRun.error}</p>}
                          {lastRun.summary && <p className="mt-1 text-muted-foreground">{lastRun.summary}</p>}
                          {lastRun.projectTypeSuggestion && lastRun.projectTypeSuggestion !== estimate.project.projectType && (
                            <p className="mt-1">
                              Suggested project type: <strong>{PROJECT_TYPE_LABELS[lastRun.projectTypeSuggestion]}</strong>{" "}
                              <Button variant="link" size="xs" onClick={() => applyProjectType(lastRun.projectTypeSuggestion!)}>
                                Apply
                              </Button>
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {status && !status.ai.enabled && (
          <Alert>
            <Sparkles />
            <AlertTitle>AI analysis is not available</AlertTitle>
            <AlertDescription>
              {status.ai.configured
                ? "An API key is set, but analysis is disabled on this deployment until sign-in is enabled (set ALLOW_UNAUTHENTICATED_ANALYSIS only on a private deployment)."
                : "Set ANTHROPIC_API_KEY on the server to enable it. Meanwhile you can add measurements manually, or load the developer-prepared extraction for a recognised reference PDF, which is clearly labelled as not AI output."}
            </AlertDescription>
          </Alert>
        )}
        <Card>
          <CardHeader>
            <CardTitle>What happens during analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>The PDF is read page by page, including image-only drawings. Every measurement records its source page, the printed label, and how it was obtained (printed, derived, grid, visual).</p>
            <p>Quantities are recomputed by the app from the dimensions. Nothing extracted is used in a cost until you approve it on the Measurements step.</p>
            <p>The AI never sets prices. Rates come from the price catalogue or are entered by an estimator.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
