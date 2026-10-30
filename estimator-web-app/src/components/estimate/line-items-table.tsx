"use client";

import { Copy, Link2, MoreHorizontal, PanelRight, Trash2 } from "lucide-react";
import { IssueIcon, Pill } from "@/components/common/badges";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ISSUE_TITLES } from "@/domain/costing/issues";
import type { EstimateCalculation } from "@/domain/costing/types";
import type { LineItem, Measurement } from "@/domain/schemas";
import { UNITS, UNIT_LABELS, type Unit } from "@/domain/units";
import { formatAmount, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DecimalInput } from "./decimal-input";

const SUPPLY_LABELS: Record<LineItem["supplyBasis"], string> = { produce: "Produce", rent: "Rent", reuse: "Reuse", client_supplied: "Client-supplied" };
const COST_TYPE_LABELS: Record<LineItem["costType"], string> = {
  material: "Material",
  labour: "Labour",
  equipment_rental: "Equipment / rental",
  subcontract: "Subcontract",
  transport: "Transport",
  other: "Other",
  unclassified: "Unclassified",
};
export { COST_TYPE_LABELS, SUPPLY_LABELS };

export function LineItemsTable({
  lines,
  calc,
  measurements,
  currency,
  onChange,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  lines: LineItem[];
  calc: EstimateCalculation;
  measurements: Measurement[];
  currency: string;
  onChange: (line: LineItem) => void;
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const results = new Map(calc.lines.map((r) => [r.lineId, r]));
  const byId = new Map(measurements.map((m) => [m.id, m]));

  const setUnit = (line: LineItem, unit: Unit) => {
    if (unit === "lump_sum") {
      onChange({ ...line, method: "lump_sum", quantityUnit: "lump_sum", rateUnit: "lump_sum", quantity: null, quantitySource: line.quantitySource.kind === "measurement" ? { kind: "manual", measurementId: null, note: "" } : line.quantitySource });
    } else {
      onChange({ ...line, method: "quantity_x_rate", quantityUnit: unit, rateUnit: line.rate === null || line.method === "lump_sum" ? unit : line.rateUnit });
    }
  };

  const setRate = (line: LineItem, rate: string | null) =>
    onChange({
      ...line,
      rate,
      rateSource:
        rate === null
          ? { kind: "none", catalogueItemId: null, catalogueRateId: null, verification: null, note: "" }
          : { kind: "manual", catalogueItemId: null, catalogueRateId: null, verification: "provisional", note: "Entered by estimator (provisional until verified)" },
    });

  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
            <th className="w-8">#</th>
            <th>Item</th>
            <th className="w-28 text-right!">Quantity</th>
            <th className="w-24">Unit</th>
            <th className="w-28 text-right!">Rate ({currency})</th>
            <th className="w-28">per</th>
            <th className="w-32 text-right!">Amount</th>
            <th className="w-10"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => {
            const result = results.get(line.id);
            const linked = line.quantitySource.kind === "measurement" ? byId.get(line.quantitySource.measurementId ?? "") : undefined;
            const issues = result?.issues ?? [];
            const blocking = issues.some((x) => x.severity === "blocking");
            return (
              <tr key={line.id} className={cn("border-b align-top last:border-0", !line.included && "bg-muted/40 text-muted-foreground", blocking && line.included && "bg-red-50/40 dark:bg-red-950/20")}>
                <td className="px-2 py-2 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                <td className="px-2 py-1.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <Input
                        defaultValue={line.name}
                        key={`${line.id}-${line.name}`}
                        aria-label="Item name"
                        className="h-7 px-2 font-medium"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== line.name) onChange({ ...line, name: v });
                          else e.target.value = line.name;
                        }}
                      />
                      <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                        <span>{line.category || "Uncategorised"}</span>·<span>{COST_TYPE_LABELS[line.costType]}</span>
                        {line.supplyBasis !== "produce" && <Pill className="h-4 text-[10px]">{SUPPLY_LABELS[line.supplyBasis]}</Pill>}
                        {!line.included && <Pill className="h-4 text-[10px]">Excluded</Pill>}
                        {line.rateSource.verification === "provisional" && <Pill tone="warning" className="h-4 text-[10px]">Provisional rate</Pill>}
                        {line.rateSource.kind === "catalogue" && <Pill tone="info" className="h-4 text-[10px]">Catalogue</Pill>}
                      </div>
                      {issues.length > 0 && line.included && (
                        <ul className="space-y-0.5">
                          {issues.filter((x) => x.code !== "PROVISIONAL_RATE").map((x, k) => (
                            <li key={k} className="flex items-start gap-1 text-[11px]">
                              <IssueIcon severity={x.severity} />
                              <span className={x.severity === "blocking" ? "text-red-800 dark:text-red-300" : "text-amber-800 dark:text-amber-300"}>
                                <strong>{ISSUE_TITLES[x.code]}:</strong> {x.message}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  {line.method === "lump_sum" ? (
                    <p className="pt-1 text-right font-mono text-sm text-muted-foreground">1</p>
                  ) : linked ? (
                    <button type="button" className="w-full text-right" onClick={() => onOpen(line.id)} title={`Linked to measurement: ${linked.componentName}`}>
                      <span className="flex items-center justify-end gap-1 pt-1 font-mono text-sm tabular-nums">
                        <Link2 className="size-3 text-sky-600" aria-hidden />
                        {linked.quantity === null ? "—" : formatAmount(linked.quantity, Math.min(4, linked.quantity.split(".")[1]?.length ?? 0))}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground">{linked.componentName}</span>
                    </button>
                  ) : (
                    <DecimalInput value={line.quantity} aria-label={`Quantity for ${line.name}`} placeholder="—" onCommit={(quantity) => onChange({ ...line, quantity, quantitySource: { kind: "manual", measurementId: null, note: line.quantity === null ? "Entered by estimator" : `Edited by estimator (previously ${line.quantity})` } })} />
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <NativeSelect size="sm" className="w-full" value={line.method === "lump_sum" ? "lump_sum" : linked ? linked.unit : line.quantityUnit} disabled={!!linked} onChange={(e) => setUnit(line, e.target.value as Unit)} aria-label={`Quantity unit for ${line.name}`}>
                    {UNITS.map((u) => (
                      <option key={u} value={u} title={UNIT_LABELS[u].long}>
                        {UNIT_LABELS[u].short}
                      </option>
                    ))}
                  </NativeSelect>
                </td>
                <td className="px-2 py-1.5">
                  <DecimalInput value={line.rate} aria-label={`${line.method === "lump_sum" ? "Lump-sum amount" : "Unit rate"} for ${line.name}`} placeholder="Not set" onCommit={(rate) => setRate(line, rate)} />
                </td>
                <td className="px-2 py-1.5">
                  {line.method === "lump_sum" ? (
                    <p className="pt-1 text-xs text-muted-foreground">lump sum</p>
                  ) : (
                    <NativeSelect size="sm" className="w-full" value={line.rateUnit} onChange={(e) => onChange({ ...line, rateUnit: e.target.value as Unit })} aria-label={`Rate unit for ${line.name}`}>
                      {UNITS.filter((u) => u !== "lump_sum").map((u) => (
                        <option key={u} value={u}>
                          per {UNIT_LABELS[u].short}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {result?.amount ? (
                    <>
                      <p className="pt-1 font-mono font-medium tabular-nums">{formatAmount(result.amount)}</p>
                      {line.method === "quantity_x_rate" && result.quantity && <p className="text-[10px] text-muted-foreground">{formatQuantity(result.quantity, result.quantityUnit)}</p>}
                    </>
                  ) : (
                    <p className="pt-1 text-xs font-medium text-red-700">{line.rate === null ? "Price not configured" : "Not calculated"}</p>
                  )}
                </td>
                <td className="px-1 py-1.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${line.name}`} />}>
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onOpen(line.id)}>
                        <PanelRight /> Details, sources & queries
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onChange({ ...line, included: !line.included })}>{line.included ? "Exclude from total" : "Include in total"}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDuplicate(line.id)}>
                        <Copy /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => onDelete(line.id)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
