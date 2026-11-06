"use client";

import { Archive, ArchiveRestore, Copy, MoreHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EstimateStatusBadge, Pill, ReadinessBadge } from "@/components/common/badges";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PROJECT_TYPE_LABELS } from "@/domain/quotation";
import { appStore } from "@/lib/store";
import { useCanEdit } from "@/lib/store/hooks";
import { deleteEstimate, duplicateEstimate, type EstimateRow } from "@/lib/estimate-actions";
import { formatAmount, formatDate } from "@/lib/format";

export function EstimatesTable({ rows, compact = false }: { rows: EstimateRow[]; compact?: boolean }) {
  const router = useRouter();
  const canEdit = useCanEdit();

  const setArchived = async (row: EstimateRow, archived: boolean) => {
    const { estimate } = row;
    const status = archived ? "archived" : estimate.versions.length > 0 ? "approved" : "draft";
    try {
      await appStore.saveEstimate({ ...estimate, status, updatedAt: new Date().toISOString() });
      toast.success(archived ? "Estimate archived" : "Estimate restored");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the estimate");
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          {!compact && <TableHead>Type</TableHead>}
          <TableHead>Status</TableHead>
          <TableHead>Completeness</TableHead>
          <TableHead className="text-right">Direct cost</TableHead>
          <TableHead className="text-right">Selling price (ex VAT)</TableHead>
          {!compact && <TableHead>Created</TableHead>}
          <TableHead>Updated</TableHead>
          <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const { estimate: e, calc } = row;
          return (
            <TableRow key={e.id}>
              <TableCell className="max-w-[320px]">
                <Link href={`/estimates/${e.id}`} className="font-medium hover:underline">
                  {e.project.projectName}
                </Link>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate">{e.project.clientName || "No client"}</span>
                  {e.documents.length > 0 && <span>· {e.documents.length} PDF</span>}
                  {e.sample && <Pill className="h-4 text-[10px]">Demo sample</Pill>}
                </div>
              </TableCell>
              {!compact && <TableCell className="text-sm text-muted-foreground">{PROJECT_TYPE_LABELS[e.project.projectType]}</TableCell>}
              <TableCell>
                <EstimateStatusBadge status={e.status} />
                {e.versions.length > 0 && <span className="ml-1.5 text-xs text-muted-foreground">v{e.versions.length}</span>}
              </TableCell>
              <TableCell>
                <ReadinessBadge ready={calc.readyForQuotation} blocking={calc.blockingCount} />
              </TableCell>
              <TableCell className="text-right font-mono text-sm tabular-nums">
                {e.costing.currency} {formatAmount(calc.directCost)}
                {calc.uncalculatedLineCount > 0 && <div className="text-[11px] text-destructive">{calc.uncalculatedLineCount} line(s) unpriced</div>}
              </TableCell>
              <TableCell className="text-right font-mono text-sm tabular-nums">
                {calc.uncalculatedLineCount > 0 ? (
                  <>
                    <span className="font-sans text-xs font-medium text-destructive">Incomplete</span>
                    {calc.sellingPriceExVat && calc.sellingPriceExVat !== "0.00" && <div className="text-[11px] text-muted-foreground">partial {formatAmount(calc.sellingPriceExVat)}</div>}
                  </>
                ) : calc.sellingPriceExVat ? (
                  `${e.costing.currency} ${formatAmount(calc.sellingPriceExVat)}`
                ) : (
                  "—"
                )}
                {row.approvedPrice && row.approvedPrice !== calc.sellingPriceExVat && (
                  <div className="text-[11px] text-muted-foreground">Approved: {formatAmount(row.approvedPrice)}</div>
                )}
              </TableCell>
              {!compact && <TableCell className="text-sm text-muted-foreground">{formatDate(e.createdAt)}</TableCell>}
              <TableCell className="text-sm text-muted-foreground">{formatDate(e.updatedAt)}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${e.project.projectName}`} />}>
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => router.push(`/estimates/${e.id}`)}>Open</DropdownMenuItem>
                    {canEdit && (
                    <DropdownMenuItem
                      onClick={async () => {
                        try {
                          const copy = await duplicateEstimate(e);
                          toast.success("Estimate duplicated (documents are not copied)");
                          router.push(`/estimates/${copy.id}`);
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Could not duplicate");
                        }
                      }}
                    >
                      <Copy /> Duplicate
                    </DropdownMenuItem>
                    )}
                    {!canEdit ? null : e.status === "archived" ? (
                      <DropdownMenuItem onClick={() => setArchived(row, false)}>
                        <ArchiveRestore /> Restore
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => setArchived(row, true)}>
                        <Archive /> Archive
                      </DropdownMenuItem>
                    )}
                    {canEdit && e.versions.length === 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={async () => {
                            if (!window.confirm(`Delete "${e.project.projectName}"? This cannot be undone.`)) return;
                            try {
                              await deleteEstimate(e);
                              toast.success("Estimate deleted");
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : "Delete failed");
                            }
                          }}
                        >
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
