"use client";

import { FilePlus2, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/common/page-header";
import { EstimatesTable } from "@/components/estimates/estimates-table";
import { LinkButton } from "@/components/ui/link-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { D } from "@/domain/money";
import { useStore } from "@/lib/store/hooks";
import { toRows } from "@/lib/estimate-actions";
import { formatAmount, formatDate } from "@/lib/format";

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border bg-background px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Dashboard() {
  const { ready, estimates, mode, context } = useStore();
  const [query, setQuery] = useState("");
  const active = useMemo(() => estimates.filter((e) => e.status !== "archived"), [estimates]);
  const rows = useMemo(() => toRows(active), [active]);

  const recent = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => !q || `${r.estimate.project.projectName} ${r.estimate.project.clientName}`.toLowerCase().includes(q))
      .sort((a, b) => b.estimate.updatedAt.localeCompare(a.estimate.updatedAt))
      .slice(0, 8);
  }, [rows, query]);

  const quotations = useMemo(
    () =>
      estimates
        .flatMap((e) => e.quotations.map((q) => ({ q, e })))
        .sort((a, b) => b.q.createdAt.localeCompare(a.q.createdAt))
        .slice(0, 6),
    [estimates],
  );

  // Only figures that exist in stored data: the latest approved version of each estimate.
  const approvedTotals = useMemo(() => {
    const byCurrency = new Map<string, InstanceType<typeof D>>();
    for (const r of rows) {
      if (!r.approvedPrice) continue;
      const c = r.estimate.costing.currency;
      byCurrency.set(c, (byCurrency.get(c) ?? new D(0)).plus(r.approvedPrice));
    }
    return [...byCurrency.entries()];
  }, [rows]);

  if (!ready) return <LoadingBlock />;

  const count = (pred: (s: string) => boolean) => active.filter((e) => pred(e.status)).length;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={
          mode === "supabase"
            ? `Estimation activity for ${context?.organisationName ?? "your organisation"}.`
            : "Estimation activity from the estimates stored in this browser."
        }
        actions={
          <LinkButton href="/estimates/new">
            <FilePlus2 /> New estimate
          </LinkButton>
        }
      />
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Total estimates" value={active.length} hint={`${estimates.length - active.length} archived`} />
          <Stat label="Drafts" value={count((s) => s === "draft")} />
          <Stat label="Awaiting review" value={count((s) => s === "in_review")} />
          <Stat label="Approved / quoted" value={count((s) => s === "approved" || s === "quoted")} />
          <Stat
            label="Approved value (ex VAT)"
            value={approvedTotals.length === 0 ? "—" : approvedTotals.map(([c, v]) => `${c} ${formatAmount(v.toString(), 0)}`).join(" · ")}
            hint="Sum of latest approved versions"
          />
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle>Recent estimates</CardTitle>
            <div className="relative w-64">
              <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" aria-hidden />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search project or client" className="pl-8" aria-label="Search estimates" />
            </div>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyState title={query ? "No matching estimates" : "No estimates yet"} action={!query && <LinkButton href="/estimates/new">New estimate</LinkButton>}>
                {!query && "Create an estimate to upload a design PDF and start costing."}
              </EmptyState>
            ) : (
              <EstimatesTable rows={recent} compact />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent quotation activity</CardTitle>
          </CardHeader>
          <CardContent>
            {quotations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No quotations generated yet. Quotations can be generated from approved estimate versions.</p>
            ) : (
              <ul className="divide-y text-sm">
                {quotations.map(({ q, e }) => (
                  <li key={q.id} className="flex items-center justify-between gap-4 py-2">
                    <Link href={`/estimates/${e.id}`} className="min-w-0 hover:underline">
                      <span className="font-mono text-xs">{q.number}</span> · {e.project.projectName} <span className="text-muted-foreground">(v{q.versionNo})</span>
                    </Link>
                    <span className="shrink-0 font-mono tabular-nums">
                      {q.currency} {formatAmount(q.totalExVat)} <span className="text-xs text-muted-foreground">ex VAT · {formatDate(q.createdAt)}</span>
                    </span>
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
