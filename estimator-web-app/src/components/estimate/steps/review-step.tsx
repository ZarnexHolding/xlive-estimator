"use client";

import { Check, CircleHelp, FileWarning, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BasisBadge, OriginBadge, Pill, ReviewBadge } from "@/components/common/badges";
import { EmptyState } from "@/components/common/page-header";
import { PdfViewer } from "@/components/pdf/pdf-viewer";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { describeDerivation, setReviewStatus } from "@/domain/measurements";
import { REFERENCE_DOCUMENTS } from "@/domain/reference-data/documents";
import type { Measurement } from "@/domain/schemas";
import { formatQuantity } from "@/lib/format";
import { appStore } from "@/lib/store";
import { useCanEdit } from "@/lib/store/hooks";
import { cn } from "@/lib/utils";
import { MeasurementDialog } from "../measurement-dialog";
import { QueriesEditor } from "../queries-editor";
import type { StepProps } from "../workspace";

const CONFIDENCE_TONE = { high: "success", medium: "warning", low: "danger" } as const;

export function ReviewStep({ estimate, update, goTo }: StepProps) {
  const docs = estimate.documents;
  const [docId, setDocId] = useState<string | null>(docs[0]?.id ?? null);
  const [loaded, setLoaded] = useState<{ docId: string; blob: Blob | null } | null>(null);
  const file = loaded && loaded.docId === docId ? loaded.blob : null;
  const fileMissing = loaded !== null && loaded.docId === docId && loaded.blob === null;
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unreviewed" | "approved" | "rejected">("all");
  const [dialog, setDialog] = useState<{ open: boolean; measurement: Measurement | null; key: number }>({ open: false, measurement: null, key: 0 });

  useEffect(() => {
    if (!docId) return;
    let active = true;
    appStore.getDocumentFile(estimate.id, docId).then(
      (blob) => active && setLoaded({ docId, blob }),
      () => active && setLoaded({ docId, blob: null }),
    );
    return () => {
      active = false;
    };
  }, [docId, estimate.id]);

  const canEdit = useCanEdit();
  const measurements = estimate.costing.measurements;
  const visible = useMemo(() => measurements.filter((m) => filter === "all" || m.reviewStatus === filter), [measurements, filter]);
  const counts = {
    unreviewed: measurements.filter((m) => m.reviewStatus === "unreviewed").length,
    approved: measurements.filter((m) => m.reviewStatus === "approved").length,
    rejected: measurements.filter((m) => m.reviewStatus === "rejected").length,
  };
  const usedByLines = (id: string) => estimate.costing.lineItems.filter((l) => l.quantitySource.measurementId === id).length;

  const replace = (m: Measurement) =>
    update((e) => ({ ...e, costing: { ...e.costing, measurements: e.costing.measurements.map((x) => (x.id === m.id ? m : x)) } }));

  const review = (m: Measurement, status: "approved" | "rejected" | "unreviewed") => {
    let reason = "";
    if (status === "rejected") {
      reason = window.prompt(`Why is "${m.componentName}" being rejected?`)?.trim() ?? "";
      if (!reason) return;
    }
    if (status === "approved" && m.basis !== "explicit_label" && m.basis !== "derived") {
      if (!window.confirm(`"${m.componentName}" is ${m.basis === "unresolved" ? "unresolved" : "an estimate (grid or visual), not a printed dimension"}. Approve it anyway?`)) return;
      reason = "Approved by estimator despite non-dimensioned basis";
    }
    try {
      replace(setReviewStatus(m, status, reason || (status === "approved" ? "Checked against drawing" : "Reopened for review"), new Date().toISOString()));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review failed");
    }
  };

  const jumpTo = (m: Measurement) => {
    setSelected(m.id);
    if (m.sourceDocumentId && m.sourceDocumentId !== docId && docs.some((d) => d.id === m.sourceDocumentId)) setDocId(m.sourceDocumentId);
    if (m.sourcePage) setPage(m.sourcePage);
  };

  const currentDoc = docs.find((d) => d.id === docId) ?? null;
  const expectedReference = REFERENCE_DOCUMENTS.find((r) => measurements.some((m) => m.sourceDocumentId === `ref-${r.key}`) && !docs.some((d) => d.id === `ref-${r.key}`));

  return (
    <div className="grid min-h-[calc(100vh-190px)] gap-0 xl:grid-cols-[minmax(360px,2fr)_3fr]">
      <section className="flex h-[calc(100vh-190px)] min-h-[480px] flex-col border-r bg-background xl:sticky xl:top-0" aria-label="Drawing viewer">
        {docs.length > 1 && (
          <div className="border-b px-3 py-2">
            <NativeSelect size="sm" className="w-full" value={docId ?? ""} onChange={(e) => { setDocId(e.target.value); setPage(1); }} aria-label="Document">
              {docs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fileName}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        {file ? (
          <PdfViewer file={file} page={page} onPageChange={setPage} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            <div className="max-w-sm space-y-3">
              <FileWarning className="mx-auto size-6" aria-hidden />
              {docs.length === 0 ? (
                <p>
                  No document is attached.
                  {expectedReference && (
                    <>
                      {" "}These measurements cite <strong>{expectedReference.fileName}</strong>; attach it to view the source pages.
                    </>
                  )}
                </p>
              ) : fileMissing ? (
                <p>
                  {currentDoc?.fileName}{" "}
                  {appStore.mode === "supabase"
                    ? "could not be loaded from your organisation's storage. Check your connection, or re-upload it on the Documents step."
                    : "is not stored in this browser. Re-upload it on the Documents step."}
                </p>
              ) : (
                <p>Loading document…</p>
              )}
              <Button variant="outline" size="sm" onClick={() => goTo("documents")}>
                Go to documents
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="min-w-0 space-y-4 p-4" aria-label="Measurements">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-semibold">Measurements</h2>
          <Pill tone="warning">{counts.unreviewed} need review</Pill>
          <Pill tone="success">{counts.approved} approved</Pill>
          <Pill tone="danger">{counts.rejected} rejected</Pill>
          <div className="ml-auto flex items-center gap-2">
            <NativeSelect size="sm" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter measurements">
              <option value="all">All</option>
              <option value="unreviewed">Needs review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </NativeSelect>
            {canEdit && (
              <Button size="sm" onClick={() => setDialog({ open: true, measurement: null, key: Date.now() })}>
                <Plus /> Add measurement
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Click a row to open its source page. A high confidence score does not approve anything: only measurements you approve can feed an approved estimate.
        </p>

        {visible.length === 0 ? (
          <EmptyState title={measurements.length === 0 ? "No measurements yet" : "Nothing in this filter"}>
            {measurements.length === 0 && "Analyse a document on the Documents step, or add measurements manually."}
          </EmptyState>
        ) : (
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Component</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Basis &amp; review</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((m) => {
                  const formula = describeDerivation(m);
                  const openQueries = m.queries.filter((q) => q.status === "open").length;
                  const lines = usedByLines(m.id);
                  return (
                    <TableRow
                      key={m.id}
                      onClick={() => jumpTo(m)}
                      className={cn("cursor-pointer align-top", selected === m.id && "bg-sky-50 dark:bg-sky-950/40", m.reviewStatus === "rejected" && "opacity-60")}
                    >
                      <TableCell className="min-w-[200px] whitespace-normal">
                        <p className="font-medium">{m.componentName}</p>
                        <p className="text-xs text-muted-foreground">{m.category || "Uncategorised"}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <OriginBadge origin={m.origin} />
                          {openQueries > 0 && (
                            <Pill tone="danger">
                              <CircleHelp className="size-3" aria-hidden /> {openQueries} open
                            </Pill>
                          )}
                          {lines > 0 && <Pill>Used by {lines} cost line(s)</Pill>}
                        </div>
                        {m.notes && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground" title={m.notes}>{m.notes}</p>}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <p className="font-mono text-sm font-medium tabular-nums">{m.quantity === null ? <span className="text-destructive">Unresolved</span> : formatQuantity(m.quantity, m.unit)}</p>
                        {formula && <p className="font-mono text-[11px] text-muted-foreground">{formula}</p>}
                      </TableCell>
                      <TableCell className="whitespace-normal text-xs">
                        {m.sourcePage ? (
                          <button type="button" className="font-medium text-info hover:underline" onClick={(e) => { e.stopPropagation(); jumpTo(m); }}>
                            Page {m.sourcePage}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">No page</span>
                        )}
                        {m.sourceLabels.length > 0 && <p className="mt-0.5 max-w-[180px] text-muted-foreground">“{m.sourceLabels.join("”, “")}”</p>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <ReviewBadge status={m.reviewStatus} />
                          <BasisBadge basis={m.basis} />
                          <Pill tone={CONFIDENCE_TONE[m.confidence]}>{m.confidence} confidence</Pill>
                        </div>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {canEdit && <div className="grid grid-cols-2 justify-items-end gap-1">
                          {m.reviewStatus !== "approved" && (
                            <Button size="icon-sm" variant="outline" aria-label={`Approve ${m.componentName}`} title="Approve" onClick={() => review(m, "approved")} disabled={m.quantity === null}>
                              <Check />
                            </Button>
                          )}
                          {m.reviewStatus !== "rejected" && (
                            <Button size="icon-sm" variant="outline" aria-label={`Reject ${m.componentName}`} title="Reject" onClick={() => review(m, "rejected")}>
                              <X />
                            </Button>
                          )}
                          {m.reviewStatus !== "unreviewed" && (
                            <Button size="icon-sm" variant="ghost" aria-label={`Reopen ${m.componentName}`} title="Reopen for review" onClick={() => review(m, "unreviewed")}>
                              <RotateCcw />
                            </Button>
                          )}
                          <Button size="icon-sm" variant="ghost" aria-label={`Edit ${m.componentName}`} title="Edit" onClick={() => setDialog({ open: true, measurement: m, key: Date.now() })}>
                            <Pencil />
                          </Button>
                        </div>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="rounded-lg border bg-background p-4">
          <h3 className="mb-2 text-sm font-semibold">Estimate-level questions and conflicts</h3>
          <QueriesEditor
            queries={estimate.costing.queries}
            onChange={(queries) => update((e) => ({ ...e, costing: { ...e.costing, queries } }))}
            emptyText="No estimate-level questions. Conflicts found by AI analysis appear here."
          />
        </div>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => goTo("costing")}>
            Next: costing
          </Button>
        </div>
      </section>

      {dialog.open && (
        <MeasurementDialog
          key={dialog.key}
          open={dialog.open}
          onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
          measurement={dialog.measurement}
          documents={docs}
          currentPage={file ? page : null}
          currentDocId={docId}
          onSave={(m) => {
            const exists = measurements.some((x) => x.id === m.id);
            update((e) => ({
              ...e,
              costing: { ...e.costing, measurements: exists ? e.costing.measurements.map((x) => (x.id === m.id ? m : x)) : [...e.costing.measurements, m] },
            }));
            toast.success(exists ? "Measurement updated" : "Measurement added");
          }}
        />
      )}
    </div>
  );
}
