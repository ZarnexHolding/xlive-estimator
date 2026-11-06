"use client";

import { Download, FileDown, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Pill } from "@/components/common/badges";
import { EmptyState } from "@/components/common/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { buildQuotation, QuotationError, type QuotationDocument } from "@/domain/quotation";
import type { QuotationRecord } from "@/domain/estimate";
import { appStore } from "@/lib/store";
import { latestVersion } from "@/domain/versioning";
import { useCanEdit, useStore } from "@/lib/store/hooks";
import { formatAmount, formatDate } from "@/lib/format";
import { downloadBlob, renderQuotationPdf } from "@/lib/quotation-client";
import type { StepProps } from "../workspace";

export function QuotationStep({ estimate, calc, goTo }: StepProps) {
  const { settings } = useStore();
  const canEdit = useCanEdit();
  const latest = latestVersion(estimate);
  const [versionId, setVersionId] = useState<string | null>(latest?.id ?? null);
  const [busy, setBusy] = useState(false);
  const version = estimate.versions.find((v) => v.id === versionId) ?? latest;

  const preview = useMemo((): { doc: QuotationDocument | null; error: string | null } => {
    if (!version) return { doc: null, error: null };
    try {
      return { doc: buildQuotation(version, settings, { number: "(assigned on generation)", issueDate: new Date().toISOString().slice(0, 10) }), error: null };
    } catch (error) {
      return { doc: null, error: error instanceof QuotationError ? error.message : "The quotation could not be prepared." };
    }
  }, [version, settings]);

  if (!version) {
    return (
      <div className="p-6">
        <EmptyState title="No approved version" action={<Button onClick={() => goTo("approval")}>Go to review &amp; approve</Button>}>
          Quotations are generated only from an approved estimate version, so the quoted figures cannot drift from what was approved.
        </EmptyState>
      </div>
    );
  }

  const draftDiffers = calc.sellingPriceExVat !== version.calculation.sellingPriceExVat || estimate.status === "draft";
  const internalNames = version.costing.lineItems.filter((l) => l.included && l.supplyBasis !== "client_supplied" && !l.customerDescription?.trim()).map((l) => l.name);

  const generate = async () => {
    setBusy(true);
    try {
      // The quotation number and record are allocated where they cannot clash or be altered
      // (the server, in connected mode); the PDF is then rendered here from that document.
      const { record, document } = await appStore.issueQuotation(estimate, version.id);
      const blob = await renderQuotationPdf(document);
      downloadBlob(blob, `${record.number}.pdf`);
      toast.success(`Quotation ${record.number} generated`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PDF generation failed");
    } finally {
      setBusy(false);
    }
  };

  /** Re-render an issued quotation from its version with its original number and date. */
  const redownload = async (q: QuotationRecord) => {
    const v = estimate.versions.find((x) => x.id === q.versionId);
    if (!v) return toast.error("The approved version for this quotation is missing.");
    setBusy(true);
    try {
      const doc = buildQuotation(v, q.settingsSnapshot, { number: q.number, issueDate: q.issueDate });
      if (doc.totalExVat !== q.totalExVat) throw new Error("The version no longer reproduces the issued total; download blocked.");
      downloadBlob(await renderQuotationPdf(doc), `${q.number}.pdf`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PDF generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 p-4 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {draftDiffers && (
          <Alert>
            <AlertTitle>The working estimate differs from v{version.versionNo}</AlertTitle>
            <AlertDescription>The quotation always uses the selected approved version, never the current draft. Approve a new version to quote the changes.</AlertDescription>
          </Alert>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Customer quotation preview</CardTitle>
            <CardDescription>Default format: scope descriptions and the final price only. Internal rates, labour costs, overhead and markup are not included.</CardDescription>
          </CardHeader>
          <CardContent>
            {preview.error ? (
              <p className="text-sm text-destructive">{preview.error}</p>
            ) : (
              preview.doc && (
                <div className="space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Client</p>
                      <p>{preview.doc.client.name || "—"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Project</p>
                      <p>{preview.doc.client.projectName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Valid for</p>
                      <p>{settings.quotationValidityDays} days from issue</p>
                      <p className="mt-1 text-xs text-muted-foreground">Source</p>
                      <p>
                        Estimate v{version.versionNo}, approved {formatDate(version.approvedAt)} by {version.approvedBy}
                      </p>
                    </div>
                  </div>
                  <table className="w-full">
                    <thead className="border-b text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1.5">#</th>
                        <th className="py-1.5">Description</th>
                        <th className="py-1.5 text-right">Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {preview.doc.scope.map((s, i) => (
                        <tr key={i}>
                          <td className="py-1.5 text-muted-foreground">{i + 1}</td>
                          <td className="py-1.5">{s.description}</td>
                          <td className="py-1.5 text-right">{s.quantity ?? "Included"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex items-baseline justify-end gap-4 border-t pt-3">
                    <span>Total (excluding VAT)</span>
                    <span className="font-mono text-lg font-semibold tabular-nums">
                      {preview.doc.currency} {formatAmount(preview.doc.totalExVat)}
                    </span>
                  </div>
                  <p className="text-right text-xs text-muted-foreground">{preview.doc.vat.statement}</p>
                </div>
              )
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Generate PDF</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="version">Approved version</Label>
              <NativeSelect id="version" className="w-full" value={version.id} onChange={(e) => setVersionId(e.target.value)}>
                {[...estimate.versions].reverse().map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNo} · {v.costing.currency} {formatAmount(v.calculation.sellingPriceExVat)} · {formatDate(v.approvedAt)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {internalNames.length > 0 && (
              <p className="text-xs text-warning">
                {internalNames.length} item(s) have no customer-facing description and will print their internal name: {internalNames.join(", ")}. Set one on the Costing step and approve a new version.
              </p>
            )}
            {settings.terms.some((t) => t.includes("[Placeholder")) && (
              <p className="text-xs text-warning">Quotation terms still contain placeholders. Review them in Settings before sending to a client.</p>
            )}
            <Button className="w-full" onClick={generate} disabled={busy || !preview.doc || !canEdit}>
              {busy ? <Loader2 className="animate-spin" /> : <FileDown />} Generate quotation PDF
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Issued quotations</CardTitle>
          </CardHeader>
          <CardContent>
            {estimate.quotations.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {[...estimate.quotations].reverse().map((q) => (
                  <li key={q.id} className="flex items-center justify-between gap-2 py-2">
                    <div>
                      <p className="font-mono text-xs font-medium">{q.number}</p>
                      <p className="text-xs text-muted-foreground">
                        v{q.versionNo} · {q.issueDate} · valid to {q.validUntil}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs tabular-nums">
                        {q.currency} {formatAmount(q.totalExVat)}
                      </span>
                      <Pill>ex VAT</Pill>
                      <Button size="icon-sm" variant="ghost" aria-label={`Download ${q.number}`} onClick={() => redownload(q)} disabled={busy}>
                        <Download />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
