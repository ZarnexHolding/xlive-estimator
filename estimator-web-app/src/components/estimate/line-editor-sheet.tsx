"use client";

import { toast } from "sonner";
import { Pill } from "@/components/common/badges";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { applyCatalogueRate, currentRate, suggestCatalogueItems, type CatalogueItem } from "@/domain/catalogue";
import type { LineResult } from "@/domain/costing/types";
import { COST_TYPES, type CostType, type LineItem, type Measurement, type SupplyBasis } from "@/domain/schemas";
import { UNIT_LABELS } from "@/domain/units";
import { formatAmount, formatQuantity } from "@/lib/format";
import { COST_TYPE_LABELS, SUPPLY_LABELS } from "./line-items-table";
import { QueriesEditor } from "./queries-editor";

const today = () => new Date().toISOString().slice(0, 10);

export function LineEditorSheet({
  line,
  result,
  measurements,
  catalogue,
  currency,
  onChange,
  onClose,
}: {
  line: LineItem | null;
  result: LineResult | undefined;
  measurements: Measurement[];
  catalogue: CatalogueItem[];
  currency: string;
  onChange: (line: LineItem) => void;
  onClose: () => void;
}) {
  if (!line) return null;
  const set = <K extends keyof LineItem>(k: K, v: LineItem[K]) => onChange({ ...line, [k]: v });
  const suggestions = suggestCatalogueItems(line, catalogue.filter((c) => currentRate(c, today()) !== null));
  const linked = measurements.find((m) => m.id === line.quantitySource.measurementId);

  const applyCatalogue = (item: CatalogueItem) => {
    try {
      const rate = currentRate(item, today());
      if (rate && rate.currency !== currency) {
        toast.error(`"${item.name}" is priced in ${rate.currency}, but this estimate is in ${currency}. No currency conversion is applied.`);
        return;
      }
      onChange(applyCatalogueRate(line, item, today()));
      toast.success(`Rate copied from "${item.name}". Later catalogue changes will not alter this line.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not apply the catalogue rate");
    }
  };

  const linkMeasurement = (id: string) => {
    if (!id) return set("quantitySource", { kind: "manual", measurementId: null, note: "" });
    const m = measurements.find((x) => x.id === id);
    if (!m) return;
    onChange({ ...line, method: "quantity_x_rate", quantityUnit: m.unit, rateUnit: line.rate === null ? m.unit : line.rateUnit, quantitySource: { kind: "measurement", measurementId: id, note: `${m.componentName}${m.sourcePage ? `, p${m.sourcePage}` : ""}` } });
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{line.name}</SheetTitle>
          <SheetDescription>{result?.formula ?? "Not calculated"}</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="l-name">Item name</Label>
              <Input id="l-name" defaultValue={line.name} key={line.name} onBlur={(e) => e.target.value.trim() && set("name", e.target.value.trim())} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-cat">Category</Label>
              <Input id="l-cat" defaultValue={line.category} key={`c-${line.category}`} onBlur={(e) => set("category", e.target.value.trim())} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-type">Cost type</Label>
              <NativeSelect id="l-type" className="w-full" value={line.costType} onChange={(e) => set("costType", e.target.value as CostType)}>
                {COST_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {COST_TYPE_LABELS[t]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-supply">Supply basis</Label>
              <NativeSelect id="l-supply" className="w-full" value={line.supplyBasis} onChange={(e) => set("supplyBasis", e.target.value as SupplyBasis)}>
                {(Object.keys(SUPPLY_LABELS) as SupplyBasis[]).map((s) => (
                  <option key={s} value={s}>
                    {SUPPLY_LABELS[s]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <label className="flex items-center gap-2 self-end pb-1 text-sm">
              <Checkbox checked={line.included} onCheckedChange={(v) => set("included", v === true)} /> Include in total
            </label>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="l-desc">Internal description</Label>
              <Textarea id="l-desc" rows={2} defaultValue={line.description} key={`d-${line.description}`} onBlur={(e) => set("description", e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="l-cust">Customer-facing description (quotation)</Label>
              <Input id="l-cust" defaultValue={line.customerDescription ?? ""} key={`cd-${line.customerDescription}`} placeholder={line.name} onBlur={(e) => set("customerDescription", e.target.value.trim() || null)} />
            </div>
          </section>

          <section className="space-y-2 rounded-md border p-3">
            <h3 className="text-sm font-semibold">Quantity source</h3>
            {line.method === "lump_sum" ? (
              <p className="text-sm text-muted-foreground">Lump sum: a fixed amount, not multiplied by a quantity. Change the unit in the table to price by quantity.</p>
            ) : (
              <>
                <NativeSelect className="w-full" value={line.quantitySource.kind === "measurement" ? (line.quantitySource.measurementId ?? "") : ""} onChange={(e) => linkMeasurement(e.target.value)} aria-label="Linked measurement">
                  <option value="">Not linked (manual or reference quantity)</option>
                  {measurements.filter((m) => m.reviewStatus !== "rejected").map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.componentName}: {m.quantity === null ? "unresolved" : formatQuantity(m.quantity, m.unit)} {m.reviewStatus === "approved" ? "✓" : "(not yet approved)"}
                    </option>
                  ))}
                </NativeSelect>
                {linked ? (
                  <p className="text-xs text-muted-foreground">Quantity follows this measurement. It must be approved on the Measurements step before the estimate can be approved.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {line.quantitySource.kind === "reference" ? "Reference quantity" : "Manual quantity"}
                    {line.quantitySource.note && `: ${line.quantitySource.note}`}
                  </p>
                )}
              </>
            )}
          </section>

          <section className="space-y-2 rounded-md border p-3">
            <h3 className="text-sm font-semibold">Rate source</h3>
            <p className="text-sm">
              {line.rate === null ? (
                <span className="font-medium text-red-700">Price not configured</span>
              ) : (
                <>
                  <span className="font-mono">
                    {currency} {formatAmount(line.rate)}
                  </span>{" "}
                  {line.method === "lump_sum" ? "lump sum" : `per ${UNIT_LABELS[line.rateUnit].short}`}{" "}
                  {line.rateSource.verification && <Pill tone={line.rateSource.verification === "verified" ? "success" : "warning"}>{line.rateSource.verification}</Pill>}
                </>
              )}
            </p>
            {line.rateSource.note && <p className="text-xs text-muted-foreground">{line.rateSource.note}</p>}
            {line.rate !== null && line.rateSource.verification === "provisional" && (
              <Button size="xs" variant="outline" onClick={() => set("rateSource", { ...line.rateSource, verification: "verified", note: `${line.rateSource.note} · verified by estimator ${new Date().toLocaleDateString("en-GB")}` })}>
                Mark this rate as verified
              </Button>
            )}
            <div className="space-y-1 pt-1">
              <p className="text-xs font-medium text-muted-foreground">Catalogue suggestions (applied only when you click)</p>
              {suggestions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No matching catalogue entries. Enter an authorised provisional rate in the table, or add the item to the price catalogue.</p>
              ) : (
                <ul className="space-y-1">
                  {suggestions.map(({ item, unitMatches }) => {
                    const rate = currentRate(item, today())!;
                    return (
                      <li key={item.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs">
                        <span className="min-w-0">
                          <span className="font-medium">{item.name}</span> · {rate.currency} {formatAmount(rate.rate)} {item.unit === "lump_sum" ? "lump sum" : `/ ${UNIT_LABELS[item.unit].short}`}{" "}
                          <Pill tone={rate.verification === "verified" ? "success" : "warning"} className="h-4 text-[10px]">{rate.verification}</Pill>
                          {!unitMatches && <span className="ml-1 text-red-700">unit differs</span>}
                        </span>
                        <Button size="xs" variant="outline" onClick={() => applyCatalogue(item)}>
                          Use
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <section className="space-y-1.5">
            <Label htmlFor="l-notes">Notes</Label>
            <Textarea id="l-notes" rows={2} defaultValue={line.notes} key={`n-${line.notes}`} onBlur={(e) => set("notes", e.target.value)} />
          </section>

          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold">Questions</h3>
            <QueriesEditor queries={line.queries} onChange={(queries) => set("queries", queries)} emptyText="No open questions on this line." />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
