import { Pill } from "@/components/common/badges";
import { PageHeader } from "@/components/common/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STANDARD_RULES } from "@/domain/costing-rules";
import { UNIT_LABELS } from "@/domain/units";

const STATUS = {
  active: { label: "Active", tone: "success" },
  needs_confirmation: { label: "Needs company input", tone: "warning" },
  not_implemented: { label: "Not implemented", tone: "neutral" },
} as const;

export function RulesPage() {
  return (
    <div>
      <PageHeader
        title="Costing rules"
        description="Quantity rules used by measurements. Rules produce quantities only; money is always quantity × rate in the costing engine."
      />
      <div className="space-y-4 p-6">
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Formula</TableHead>
                <TableHead>Output</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assumptions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {STANDARD_RULES.map((r) => (
                <TableRow key={r.id} className="align-top">
                  <TableCell className="max-w-[260px] whitespace-normal">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.description}</p>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{r.formula}</TableCell>
                  <TableCell className="text-sm">{UNIT_LABELS[r.outputUnit].long}</TableCell>
                  <TableCell>
                    <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>
                  </TableCell>
                  <TableCell className="max-w-[360px] text-xs whitespace-normal text-muted-foreground">{r.assumptions.join(" ") || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="max-w-3xl space-y-2 rounded-lg border bg-background p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Pricing rules applied by the engine</p>
          <p>Line amount = quantity × unit rate, only when the quantity unit equals the rate unit. Lump sums are fixed amounts and are never multiplied.</p>
          <p>Overhead (on direct cost), then contingency (on direct cost + overhead), then pricing: markup = cost × (1 + r); margin = cost ÷ (1 − r); or a fixed price with a recorded reason.</p>
          <p>Amounts round half-up to 2 decimals per line; totals are sums of rounded lines. Prices exclude VAT.</p>
          <p>Company-specific rules (labour productivity, waste factors, sheet nesting) will be added once XLive documents them. See docs/costing-rules.md.</p>
        </div>
      </div>
    </div>
  );
}
