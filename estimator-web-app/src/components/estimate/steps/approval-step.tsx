"use client";

import { CheckCircle2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BasisBadge, EstimateStatusBadge, Pill } from "@/components/common/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BASIS_LABELS } from "@/domain/measurements";
import { verifyVersion } from "@/domain/versioning";
import { appStore } from "@/lib/store";
import { useCanEdit } from "@/lib/store/hooks";
import { formatAmount, formatMoney, formatPercent, formatQuantity } from "@/lib/format";
import { IssuesList } from "../issues-list";
import type { StepProps } from "../workspace";

const MODE_LABEL = { markup: "Markup on cost", margin: "Target gross margin", fixed_price: "Fixed selling price" } as const;

export function ApprovalStep({ estimate, calc, update, goTo }: StepProps) {
  const [approver, setApprover] = useState(estimate.project.estimator);
  const [note, setNote] = useState("");
  const [ack, setAck] = useState(false);
  const [approving, setApproving] = useState(false);
  const canEdit = useCanEdit();
  const blocking = calc.issues.filter((i) => i.severity === "blocking");
  const warnings = calc.issues.filter((i) => i.severity === "warning");
  const { costing } = estimate;

  const usedMeasurementIds = new Set(costing.lineItems.filter((l) => l.included && l.quantitySource.kind === "measurement").map((l) => l.quantitySource.measurementId));
  const usedMeasurements = costing.measurements.filter((m) => usedMeasurementIds.has(m.id));
  const nonDimensioned = usedMeasurements.filter((m) => m.basis !== "explicit_label" && m.basis !== "derived");

  const approve = async () => {
    setApproving(true);
    try {
      // The costing engine recalculates from the stored estimate before the version is recorded;
      // the totals on this screen are never sent as the approved figures.
      await appStore.approve(estimate, { approvedBy: approver, note, acknowledgeWarnings: ack });
      toast.success("Estimate approved. An immutable version was saved.");
      setNote("");
      setAck(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approval failed");
    } finally {
      setApproving(false);
    }
  };

  const setStatus = (status: "draft" | "in_review") => update((e) => ({ ...e, status }), { contentEdit: false });

  return (
    <div className="grid gap-4 p-4 xl:grid-cols-[1fr_400px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {blocking.length === 0 ? <CheckCircle2 className="size-5 text-success" /> : <ShieldAlert className="size-5 text-destructive" />}
              {blocking.length === 0 ? "No blocking issues" : `${blocking.length} blocking issue(s)`}
            </CardTitle>
            <CardDescription>The estimate cannot be approved or quoted while blocking issues remain.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <IssuesList issues={blocking} empty="Every included line has a confirmed quantity, unit and rate." />
            {blocking.length > 0 && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => goTo("review")}>
                  Go to measurements
                </Button>
                <Button size="sm" variant="outline" onClick={() => goTo("costing")}>
                  Go to costing
                </Button>
              </div>
            )}
            <div>
              <h3 className="mb-2 text-sm font-semibold">Warnings ({warnings.length})</h3>
              <IssuesList issues={warnings} empty="No warnings." />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Measurement assumptions used in costs</CardTitle>
          </CardHeader>
          <CardContent>
            {usedMeasurements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cost line is linked to a measurement; quantities are manual or reference values (see each line&apos;s quantity source).</p>
            ) : (
              <ul className="divide-y text-sm">
                {usedMeasurements.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span>
                      {m.componentName} · <span className="font-mono">{m.quantity ? formatQuantity(m.quantity, m.unit) : "unresolved"}</span>
                      {m.sourcePage && <span className="text-muted-foreground"> · p{m.sourcePage}</span>}
                    </span>
                    <span className="flex gap-1">
                      <BasisBadge basis={m.basis} />
                      <Pill tone={m.reviewStatus === "approved" ? "success" : "danger"}>{m.reviewStatus}</Pill>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {nonDimensioned.length > 0 && (
              <p className="mt-3 text-xs text-warning">
                {nonDimensioned.length} quantity(ies) rely on {[...new Set(nonDimensioned.map((m) => BASIS_LABELS[m.basis].toLowerCase()))].join(" / ")} rather than printed dimensions.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {calc.byCategory.map((c) => (
                  <tr key={c.category}>
                    <td className="py-1.5">{c.category}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{formatAmount(c.amount)}</td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="py-1.5">Direct cost</td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{formatAmount(calc.directCost)}</td>
                </tr>
                <tr>
                  <td className="py-1.5 text-muted-foreground">Overhead ({costing.overhead.mode === "percent" ? formatPercent(costing.overhead.value) : costing.overhead.mode.replace("_", " ")})</td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{formatAmount(calc.overhead.amount)}</td>
                </tr>
                <tr>
                  <td className="py-1.5 text-muted-foreground">Contingency ({costing.contingency.mode === "percent" ? formatPercent(costing.contingency.value) : costing.contingency.mode.replace("_", " ")})</td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{formatAmount(calc.contingency.amount)}</td>
                </tr>
                <tr className="font-medium">
                  <td className="py-1.5">Cost base</td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{formatAmount(calc.costBase)}</td>
                </tr>
                <tr>
                  <td className="py-1.5 text-muted-foreground">
                    {MODE_LABEL[costing.pricing.mode]}
                    {calc.pricing.rate && ` ${formatPercent(calc.pricing.rate)}`}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{formatAmount(calc.pricing.profit)}</td>
                </tr>
                <tr className="text-base font-semibold">
                  <td className="py-2">Selling price (excluding VAT)</td>
                  <td className="py-2 text-right font-mono tabular-nums">{formatMoney(calc.sellingPriceExVat, costing.currency)}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Approve estimate</CardTitle>
            <CardDescription>
              Approval freezes a complete snapshot (quantities, rates, pricing, totals). Later edits or catalogue changes create a new draft and never alter it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              Status: <EstimateStatusBadge status={estimate.status} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="approver">Approved by *</Label>
              <Input id="approver" value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="Name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="approval-note">Approval note</Label>
              <Textarea id="approval-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            {warnings.length > 0 && (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
                I have read the {warnings.length} warning(s) and accept them for this version.
              </label>
            )}
            <Button className="w-full" disabled={!canEdit || approving || !calc.readyForQuotation || !approver.trim() || (warnings.length > 0 && !ack)} onClick={approve}>
              {approving ? "Recording approval…" : `Approve as v${estimate.versions.length + 1}`}
            </Button>
            {!canEdit && <p className="text-xs text-muted-foreground">Your role is read-only.</p>}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" disabled={estimate.status === "in_review"} onClick={() => setStatus("in_review")}>
                Mark awaiting review
              </Button>
              <Button size="sm" variant="outline" className="flex-1" disabled={estimate.status === "draft"} onClick={() => setStatus("draft")}>
                Return to draft
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Approved versions</CardTitle>
          </CardHeader>
          <CardContent>
            {estimate.versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No approved versions yet.</p>
            ) : (
              <ul className="space-y-2">
                {[...estimate.versions].reverse().map((v) => {
                  const integrity = verifyVersion(v);
                  return (
                    <li key={v.id} className="rounded-md border p-2.5 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">v{v.versionNo}</span>
                        <span className="font-mono tabular-nums">{formatMoney(v.calculation.sellingPriceExVat, v.costing.currency)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(v.approvedAt).toLocaleString("en-GB")} by {v.approvedBy} · {v.costing.lineItems.length} lines · {MODE_LABEL[v.costing.pricing.mode]}
                      </p>
                      {v.approvalNote && <p className="mt-1 text-xs">{v.approvalNote}</p>}
                      {v.acknowledgedWarnings.length > 0 && <p className="mt-1 text-xs text-warning">{v.acknowledgedWarnings.length} warning(s) acknowledged</p>}
                      <p className={`mt-1 text-xs ${integrity.ok ? "text-success" : "text-destructive"}`}>
                        {integrity.ok ? "Snapshot verified: recalculation matches stored totals" : "Integrity check failed: stored totals do not match recalculation"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            {estimate.versions.length > 0 && (
              <Button className="mt-3 w-full" variant="secondary" onClick={() => goTo("quotation")}>
                Go to quotation
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
