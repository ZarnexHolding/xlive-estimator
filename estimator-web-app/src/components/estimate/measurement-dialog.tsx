"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { makeMeasurement } from "@/domain/factories";
import { BASIS_LABELS, deriveQuantity, editMeasurement } from "@/domain/measurements";
import { parseDecimalInput } from "@/domain/money";
import { DIMENSION_KEYS, MEASUREMENT_BASES, type DimensionKey, type DocumentRef, type Measurement } from "@/domain/schemas";
import { UNIT_LABELS, type Unit } from "@/domain/units";
import { newId } from "@/lib/ids";
import { QueriesEditor } from "./queries-editor";

const MANUAL_UNITS: Unit[] = ["each", "lm", "m2", "m3", "kg", "sheet"];

interface Draft {
  componentName: string;
  category: string;
  dims: Record<DimensionKey, string>;
  useDerivation: boolean;
  derivationDims: DimensionKey[];
  multiplier: string;
  quantity: string;
  unit: Unit;
  sourceDocumentId: string;
  sourcePage: string;
  sourceLabels: string;
  basis: Measurement["basis"];
  confidence: Measurement["confidence"];
  notes: string;
  queries: Measurement["queries"];
}

function toDraft(m: Measurement | null, page: number | null, docId: string | null): Draft {
  return {
    componentName: m?.componentName ?? "",
    category: m?.category ?? "",
    dims: Object.fromEntries(DIMENSION_KEYS.map((k) => [k, m?.dimensions[k] ?? ""])) as Record<DimensionKey, string>,
    useDerivation: m ? m.derivation !== null : true,
    derivationDims: m?.derivation?.dims ?? ["length", "width"],
    multiplier: m?.derivation?.multiplier ?? "1",
    quantity: m?.quantity ?? "",
    unit: m?.unit ?? "m2",
    sourceDocumentId: m?.sourceDocumentId ?? docId ?? "",
    sourcePage: String(m?.sourcePage ?? page ?? ""),
    sourceLabels: m?.sourceLabels.join("; ") ?? "",
    basis: m?.basis ?? "explicit_label",
    confidence: m?.confidence ?? "high",
    notes: m?.notes ?? "",
    queries: m?.queries ?? [],
  };
}

export function MeasurementDialog({
  open,
  onOpenChange,
  measurement,
  documents,
  currentPage,
  currentDocId,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  measurement: Measurement | null;
  documents: DocumentRef[];
  currentPage: number | null;
  currentDocId: string | null;
  onSave: (m: Measurement) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(measurement, currentPage, currentDocId));
  const [reason, setReason] = useState("");
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const dimensions = Object.fromEntries(DIMENSION_KEYS.map((k) => [k, parseDecimalInput(draft.dims[k])])) as Measurement["dimensions"];
  const derivation = draft.useDerivation ? { dims: draft.derivationDims, multiplier: parseDecimalInput(draft.multiplier) ?? "1" } : null;
  const derived = deriveQuantity(dimensions, derivation);

  const save = () => {
    if (!draft.componentName.trim()) return toast.error("Component name is required.");
    const page = draft.sourcePage.trim() ? Number(draft.sourcePage) : null;
    if (page !== null && (!Number.isInteger(page) || page < 1)) return toast.error("Source page must be a positive whole number.");
    const quantity = draft.useDerivation ? (derived?.quantity ?? null) : parseDecimalInput(draft.quantity);
    if (!draft.useDerivation && draft.quantity.trim() && quantity === null) return toast.error("Quantity must be a number.");
    if (quantity?.startsWith("-")) return toast.error("Quantity cannot be negative.");
    const at = new Date().toISOString();
    const fields = {
      componentName: draft.componentName.trim(),
      category: draft.category.trim(),
      dimensions,
      derivation,
      quantity,
      unit: draft.useDerivation ? (derived?.unit ?? draft.unit) : draft.unit,
      sourcePage: page,
      notes: draft.notes,
      basis: draft.basis,
    };
    try {
      if (measurement) {
        if (!reason.trim()) return toast.error("Record why the measurement was changed.");
        const edited = editMeasurement(measurement, fields, reason.trim(), at);
        onSave({
          ...edited,
          sourceDocumentId: draft.sourceDocumentId || null,
          sourceLabels: draft.sourceLabels.split(";").map((s) => s.trim()).filter(Boolean),
          confidence: draft.confidence,
          queries: draft.queries,
        });
      } else {
        onSave(
          makeMeasurement({
            id: newId(),
            ...fields,
            origin: "manual",
            sourceDocumentId: draft.sourceDocumentId || null,
            sourceLabels: draft.sourceLabels.split(";").map((s) => s.trim()).filter(Boolean),
            confidence: draft.confidence,
            queries: draft.queries,
            reviewHistory: [{ at, action: "created", reason: reason.trim() || "Added manually by estimator" }],
          }),
        );
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid measurement");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{measurement ? "Edit measurement" : "Add measurement"}</DialogTitle>
          <DialogDescription>Dimensions are in metres. Quantities are recomputed from the dimensions you select.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="m-name">Component *</Label>
            <Input id="m-name" value={draft.componentName} onChange={(e) => set("componentName", e.target.value)} placeholder="e.g. Back wall" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-cat">Category</Label>
            <Input id="m-cat" value={draft.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Walls" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-basis">Basis</Label>
            <NativeSelect id="m-basis" className="w-full" value={draft.basis} onChange={(e) => set("basis", e.target.value as Draft["basis"])}>
              {MEASUREMENT_BASES.map((b) => (
                <option key={b} value={b}>
                  {BASIS_LABELS[b]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className="text-sm font-medium">Dimensions (m)</legend>
            <div className="grid grid-cols-4 gap-2">
              {DIMENSION_KEYS.map((k) => (
                <div key={k} className="space-y-1">
                  <Label htmlFor={`m-${k}`} className="text-xs capitalize">
                    {k}
                  </Label>
                  <Input id={`m-${k}`} inputMode="decimal" value={draft.dims[k]} onChange={(e) => set("dims", { ...draft.dims, [k]: e.target.value })} />
                </div>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2 rounded-md border p-3 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={draft.useDerivation} onCheckedChange={(v) => set("useDerivation", v === true)} />
              Calculate quantity from dimensions
            </label>
            {draft.useDerivation ? (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {DIMENSION_KEYS.map((k) => (
                  <label key={k} className="flex items-center gap-1.5 capitalize">
                    <Checkbox
                      checked={draft.derivationDims.includes(k)}
                      onCheckedChange={(v) =>
                        set("derivationDims", v === true ? [...draft.derivationDims, k].slice(0, 3) : draft.derivationDims.filter((x) => x !== k))
                      }
                    />
                    {k}
                  </label>
                ))}
                <label className="flex items-center gap-1.5">
                  × count
                  <Input className="h-7 w-16" inputMode="decimal" value={draft.multiplier} onChange={(e) => set("multiplier", e.target.value)} aria-label="Multiplier" />
                </label>
                <span className="ml-auto font-mono text-sm">
                  = {derived ? `${derived.quantity} ${UNIT_LABELS[derived.unit].short}` : "missing dimension"}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input className="w-40" inputMode="decimal" value={draft.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="Quantity (blank = unresolved)" aria-label="Quantity" />
                <NativeSelect value={draft.unit} onChange={(e) => set("unit", e.target.value as Unit)} aria-label="Unit">
                  {MANUAL_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {UNIT_LABELS[u].long}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-doc">Source document</Label>
            <NativeSelect id="m-doc" className="w-full" value={draft.sourceDocumentId} onChange={(e) => set("sourceDocumentId", e.target.value)}>
              <option value="">None</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fileName}
                </option>
              ))}
              {draft.sourceDocumentId && !documents.some((d) => d.id === draft.sourceDocumentId) && <option value={draft.sourceDocumentId}>(document not attached)</option>}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-page">Source page</Label>
            <Input id="m-page" inputMode="numeric" value={draft.sourcePage} onChange={(e) => set("sourcePage", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-labels">Printed labels (separate with ;)</Label>
            <Input id="m-labels" value={draft.sourceLabels} onChange={(e) => set("sourceLabels", e.target.value)} placeholder="14m; 5m" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-conf">Confidence</Label>
            <NativeSelect id="m-conf" className="w-full" value={draft.confidence} onChange={(e) => set("confidence", e.target.value as Draft["confidence"])}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </NativeSelect>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="m-notes">Notes</Label>
            <Textarea id="m-notes" rows={2} value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Open questions</Label>
            <QueriesEditor queries={draft.queries} onChange={(q) => set("queries", q)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="m-reason">{measurement ? "Reason for change *" : "Note on source (optional)"}</Label>
            <Input id="m-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={measurement ? "e.g. Corrected to match elevation on p15" : "e.g. Measured on site"} />
            {measurement?.reviewStatus === "approved" && <p className="text-xs text-amber-700">Changing an approved measurement returns it to review.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>{measurement ? "Save changes" : "Add measurement"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
