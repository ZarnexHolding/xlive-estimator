"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { applyCatalogueRate, currentRate } from "@/domain/catalogue";
import { makeLine } from "@/domain/factories";
import type { LineItem } from "@/domain/schemas";
import { UNIT_LABELS } from "@/domain/units";
import { newId } from "@/lib/ids";
import { useStore } from "@/lib/store/hooks";
import { formatAmount, formatQuantity } from "@/lib/format";
import { LineEditorSheet } from "../line-editor-sheet";
import { LineItemsTable } from "../line-items-table";
import { PricingPanel } from "../pricing-panel";
import type { StepProps } from "../workspace";

const today = () => new Date().toISOString().slice(0, 10);

export function CostingStep({ estimate, calc, update, goTo }: StepProps) {
  const { catalogue } = useStore();
  const [openLine, setOpenLine] = useState<string | null>(null);
  const { costing } = estimate;

  const setLines = (fn: (lines: LineItem[]) => LineItem[]) => update((e) => ({ ...e, costing: { ...e.costing, lineItems: fn(e.costing.lineItems) } }));
  const changeLine = (line: LineItem) => setLines((lines) => lines.map((l) => (l.id === line.id ? line : l)));
  const addLine = (line: LineItem) => {
    if (setLines((lines) => [...lines, line])) toast.success(`Added "${line.name}"`);
  };

  const addFromMeasurement = (id: string) => {
    const m = costing.measurements.find((x) => x.id === id);
    if (!m) return;
    addLine(
      makeLine({
        id: newId(),
        name: m.componentName,
        category: m.category,
        quantityUnit: m.unit,
        rateUnit: m.unit,
        quantitySource: { kind: "measurement", measurementId: m.id, note: `${m.componentName}${m.sourcePage ? `, p${m.sourcePage}` : ""}` },
      }),
    );
  };
  const addFromCatalogue = (id: string) => {
    const item = catalogue.find((c) => c.id === id);
    if (!item) return;
    const rate = currentRate(item, today());
    if (rate && rate.currency !== costing.currency) return toast.error(`"${item.name}" is priced in ${rate.currency}; this estimate is in ${costing.currency}.`);
    const base = makeLine({ id: newId(), name: item.name, category: item.category, costType: item.costType, quantityUnit: item.unit, rateUnit: item.unit });
    addLine(rate ? applyCatalogueRate(base, item, today()) : base);
  };

  const open = costing.lineItems.find((l) => l.id === openLine) ?? null;
  const pricedCatalogue = catalogue.filter((c) => c.active);

  return (
    <div className="grid gap-4 p-4 2xl:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-semibold">Cost lines</h2>
          <Button size="sm" onClick={() => addLine(makeLine({ id: newId(), name: "New item" }))}>
            <Plus /> Blank line
          </Button>
          <NativeSelect size="sm" value="" onChange={(e) => addFromMeasurement(e.target.value)} aria-label="Add line from measurement" disabled={costing.measurements.length === 0}>
            <option value="">+ From measurement…</option>
            {costing.measurements.filter((m) => m.reviewStatus !== "rejected").map((m) => (
              <option key={m.id} value={m.id}>
                {m.componentName} ({m.quantity === null ? "unresolved" : formatQuantity(m.quantity, m.unit)})
              </option>
            ))}
          </NativeSelect>
          <NativeSelect size="sm" value="" onChange={(e) => addFromCatalogue(e.target.value)} aria-label="Add line from catalogue" disabled={pricedCatalogue.length === 0}>
            <option value="">+ From catalogue…</option>
            {pricedCatalogue.map((c) => {
              const rate = currentRate(c, today());
              return (
                <option key={c.id} value={c.id}>
                  {c.name}: {rate ? `${rate.currency} ${formatAmount(rate.rate)}${c.unit === "lump_sum" ? "" : ` / ${UNIT_LABELS[c.unit].short}`}` : "no rate"}
                </option>
              );
            })}
          </NativeSelect>
          <a href="#pricing" className="ml-auto text-sm text-info hover:underline 2xl:hidden">
            Pricing &amp; allowances ↓
          </a>
        </div>
        {costing.lineItems.length === 0 ? (
          <EmptyState title="No cost lines yet">Add lines from approved measurements, from the price catalogue, or as blank lines.</EmptyState>
        ) : (
          <LineItemsTable
            lines={costing.lineItems}
            calc={calc}
            measurements={costing.measurements}
            currency={costing.currency}
            onChange={changeLine}
            onOpen={setOpenLine}
            onDuplicate={(id) => {
              const src = costing.lineItems.find((l) => l.id === id);
              if (!src) return;
              const copy = { ...structuredClone(src), id: newId(), name: `${src.name} (copy)`, queries: [] };
              setLines((lines) => lines.flatMap((l) => (l.id === id ? [l, copy] : [l])));
            }}
            onDelete={(id) => {
              const src = costing.lineItems.find((l) => l.id === id);
              if (src && window.confirm(`Delete "${src.name}"?`)) setLines((lines) => lines.filter((l) => l.id !== id));
            }}
          />
        )}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => goTo("approval")}>
            Next: review &amp; approve
          </Button>
        </div>
      </div>
      <aside id="pricing" className="scroll-mt-4 2xl:sticky 2xl:top-4 2xl:self-start">
        <PricingPanel costing={costing} calc={calc} onChange={(next) => update((e) => ({ ...e, costing: next }))} />
      </aside>
      <LineEditorSheet
        line={open}
        result={calc.lines.find((r) => r.lineId === openLine)}
        measurements={costing.measurements}
        catalogue={catalogue}
        currency={costing.currency}
        onChange={changeLine}
        onClose={() => setOpenLine(null)}
      />
    </div>
  );
}
