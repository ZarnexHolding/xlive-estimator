"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Pill } from "@/components/common/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { EstimateCalculation } from "@/domain/costing/types";
import { parseDecimalInput } from "@/domain/money";
import type { Allowance, CostingInput, PricingMode } from "@/domain/schemas";
import { COST_TYPES } from "@/domain/schemas";
import { newId } from "@/lib/ids";
import { formatAmount, formatMoney, formatPercent, fractionToPercentInput, percentToFraction } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DecimalInput } from "./decimal-input";
import { COST_TYPE_LABELS } from "./line-items-table";

const MODE_LABELS: Record<PricingMode, string> = { markup: "Markup on cost", margin: "Target gross margin", fixed_price: "Fixed selling price" };

function PercentInput({ value, onCommit, label }: { value: string; onCommit: (fraction: string) => void; label: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="relative">
      <Input
        aria-label={label}
        inputMode="decimal"
        className="h-8 pr-7 text-right font-mono tabular-nums"
        value={text ?? fractionToPercentInput(value)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text === null) return;
          const fraction = percentToFraction(text);
          if (fraction === null) toast.error("Enter a percentage such as 30.");
          else onCommit(fraction);
          setText(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <span className="pointer-events-none absolute top-1.5 right-2 text-sm text-muted-foreground">%</span>
    </div>
  );
}

function AllowanceRow({ label, allowance, amount, onChange }: { label: string; allowance: Allowance; amount: string; onChange: (a: Allowance) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm">{label}</Label>
        <span className="font-mono text-sm tabular-nums">{formatAmount(amount)}</span>
      </div>
      <div className="flex gap-2">
        <NativeSelect
          size="sm"
          className="flex-1"
          value={allowance.mode}
          aria-label={`${label} mode`}
          onChange={(e) => onChange({ ...allowance, mode: e.target.value as Allowance["mode"], value: e.target.value === "percent" || e.target.value === "fixed" ? allowance.value : null })}
        >
          <option value="not_set">Not set (decide)</option>
          <option value="none">None</option>
          <option value="percent">Percentage</option>
          <option value="fixed">Fixed amount</option>
        </NativeSelect>
        {allowance.mode === "percent" && (
          <div className="w-28">
            <PercentInput label={`${label} percentage`} value={allowance.value ?? "0"} onCommit={(v) => onChange({ ...allowance, value: v })} />
          </div>
        )}
        {allowance.mode === "fixed" && (
          <div className="w-28">
            <DecimalInput aria-label={`${label} amount`} value={allowance.value} onCommit={(v) => onChange({ ...allowance, value: v })} className="h-7" />
          </div>
        )}
      </div>
      {allowance.mode === "not_set" && <p className="text-[11px] text-amber-700">No company policy configured: choose an allowance or &quot;None&quot;.</p>}
    </div>
  );
}

export function PricingPanel({ costing, calc, onChange }: { costing: CostingInput; calc: EstimateCalculation; onChange: (c: CostingInput) => void }) {
  const { pricing, currency } = costing;
  const setPricing = (p: Partial<CostingInput["pricing"]>) => onChange({ ...costing, pricing: { ...pricing, ...p } });
  const [newRec, setNewRec] = useState({ label: "", total: "", source: "" });

  const addReconciliation = () => {
    const total = parseDecimalInput(newRec.total);
    if (!newRec.label.trim() || total === null || total.startsWith("-")) return toast.error("Enter a label and a non-negative reported total.");
    onChange({ ...costing, reconciliations: [...costing.reconciliations, { id: newId(), label: newRec.label.trim(), reportedTotal: total, source: newRec.source.trim(), explanation: null }] });
    setNewRec({ label: "", total: "", source: "" });
  };

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border bg-background p-4">
        <h3 className="text-sm font-semibold">Cost summary</h3>
        <dl className="space-y-1 text-sm">
          {COST_TYPES.filter((t) => calc.byCostType[t] !== "0.00").map((t) => (
            <div key={t} className="flex justify-between text-muted-foreground">
              <dt>{COST_TYPE_LABELS[t]}</dt>
              <dd className="font-mono tabular-nums">{formatAmount(calc.byCostType[t])}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t pt-1 font-medium">
            <dt>Direct cost</dt>
            <dd className="font-mono tabular-nums">{formatMoney(calc.directCost, currency)}</dd>
          </div>
          {calc.uncalculatedLineCount > 0 && <p className="text-xs text-red-700">{calc.uncalculatedLineCount} included line(s) have no amount and are not in this total.</p>}
        </dl>
        <AllowanceRow label="Overhead" allowance={costing.overhead} amount={calc.overhead.amount} onChange={(overhead) => onChange({ ...costing, overhead })} />
        <AllowanceRow label="Contingency" allowance={costing.contingency} amount={calc.contingency.amount} onChange={(contingency) => onChange({ ...costing, contingency })} />
        <div className="flex justify-between border-t pt-2 text-sm font-medium">
          <span>Cost base</span>
          <span className="font-mono tabular-nums">{formatMoney(calc.costBase, currency)}</span>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border bg-background p-4">
        <h3 className="text-sm font-semibold">Pricing method</h3>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Pricing method">
          {(Object.keys(MODE_LABELS) as PricingMode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={pricing.mode === m}
              onClick={() => setPricing({ mode: m })}
              className={cn("rounded-md px-2 py-1 text-xs", pricing.mode === m ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {MODE_LABELS[m].split(" ")[0]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {pricing.mode === "markup" && "Selling price = cost base × (1 + markup)."}
          {pricing.mode === "margin" && "Selling price = cost base ÷ (1 − margin). A 30 % margin is not the same as a 30 % markup."}
          {pricing.mode === "fixed_price" && "Selling price is entered directly. A reason is recorded with the estimate."}
        </p>
        {pricing.mode === "markup" && (
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm">Markup on cost</Label>
            <div className="w-28">
              <PercentInput label="Markup percentage" value={pricing.markupRate} onCommit={(markupRate) => setPricing({ markupRate })} />
            </div>
          </div>
        )}
        {pricing.mode === "margin" && (
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm">Target gross margin</Label>
            <div className="w-28">
              <PercentInput label="Margin percentage" value={pricing.marginRate} onCommit={(marginRate) => setPricing({ marginRate })} />
            </div>
          </div>
        )}
        {pricing.mode === "fixed_price" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm">Selling price ({currency})</Label>
              <div className="w-36">
                <DecimalInput aria-label="Fixed selling price" value={pricing.fixedPrice} onCommit={(fixedPrice) => setPricing({ fixedPrice })} />
              </div>
            </div>
            <Input defaultValue={pricing.fixedPriceReason} key={pricing.fixedPriceReason} placeholder="Reason for the fixed price (required)" aria-label="Reason for fixed price" onBlur={(e) => setPricing({ fixedPriceReason: e.target.value.trim() })} />
          </div>
        )}
        <dl className="space-y-1 border-t pt-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <dt>{pricing.mode === "fixed_price" ? "Difference to cost" : pricing.mode === "markup" ? "Markup amount" : "Gross profit"}</dt>
            <dd className="font-mono tabular-nums">{formatAmount(calc.pricing.profit)}</dd>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <dt>Effective markup / margin</dt>
            <dd className="font-mono tabular-nums">
              {formatPercent(calc.pricing.effectiveMarkup)} / {formatPercent(calc.pricing.effectiveMargin)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <dt className="font-semibold">Selling price</dt>
            <dd className="font-mono text-lg font-semibold tabular-nums">{formatMoney(calc.sellingPriceExVat, currency)}</dd>
          </div>
          <p className="text-right text-[11px] text-muted-foreground">Excludes VAT · {MODE_LABELS[pricing.mode]}</p>
        </dl>
      </section>

      <section className="space-y-3 rounded-lg border bg-background p-4">
        <h3 className="text-sm font-semibold">Reconciliation</h3>
        <p className="text-xs text-muted-foreground">Record totals reported elsewhere (e.g. a separate cost summary) to check them against the line items. Lines are never adjusted to force a match.</p>
        {calc.reconciliations.map((r) => {
          const rec = costing.reconciliations.find((x) => x.id === r.id)!;
          return (
            <div key={r.id} className="space-y-1.5 rounded-md border p-2.5 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{r.label}</p>
                <Button variant="ghost" size="icon-xs" aria-label={`Remove ${r.label}`} onClick={() => onChange({ ...costing, reconciliations: costing.reconciliations.filter((x) => x.id !== r.id) })}>
                  <Trash2 />
                </Button>
              </div>
              <dl className="grid grid-cols-2 gap-x-2 text-xs">
                <dt className="text-muted-foreground">Reported total</dt>
                <dd className="text-right font-mono">{formatAmount(r.reportedTotal)}</dd>
                <dt className="text-muted-foreground">Sum of listed items</dt>
                <dd className="text-right font-mono">{formatAmount(r.calculatedTotal)}</dd>
                <dt className="font-medium">Difference</dt>
                <dd className="text-right font-mono font-medium">{formatAmount(r.difference)}</dd>
              </dl>
              <Pill tone={r.status === "reconciled" ? "success" : r.status === "explained" ? "info" : "danger"}>{r.status === "unresolved" ? "Unresolved" : r.status === "explained" ? "Explained" : "Reconciled"}</Pill>
              {rec.source && <p className="text-[11px] text-muted-foreground">Source: {rec.source}</p>}
              {r.status !== "reconciled" && (
                <Input
                  className="h-7 text-xs"
                  defaultValue={rec.explanation ?? ""}
                  key={rec.explanation ?? ""}
                  placeholder="Explanation of the difference (resolves the block)"
                  aria-label={`Explanation for ${r.label}`}
                  onBlur={(e) => onChange({ ...costing, reconciliations: costing.reconciliations.map((x) => (x.id === r.id ? { ...x, explanation: e.target.value.trim() || null } : x)) })}
                />
              )}
            </div>
          );
        })}
        <div className="grid gap-1.5">
          <Input className="h-7 text-xs" placeholder="Label, e.g. Total reported by client" value={newRec.label} onChange={(e) => setNewRec({ ...newRec, label: e.target.value })} aria-label="Reconciliation label" />
          <div className="flex gap-1.5">
            <Input className="h-7 text-xs" placeholder={`Reported total (${currency})`} value={newRec.total} onChange={(e) => setNewRec({ ...newRec, total: e.target.value })} aria-label="Reported total" />
            <Input className="h-7 text-xs" placeholder="Source" value={newRec.source} onChange={(e) => setNewRec({ ...newRec, source: e.target.value })} aria-label="Source" />
            <Button size="sm" variant="secondary" onClick={addReconciliation} aria-label="Add reconciliation">
              <Plus />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
