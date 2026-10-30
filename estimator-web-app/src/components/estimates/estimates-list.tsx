"use client";

import { FilePlus2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/common/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ESTIMATE_STATUSES, PROJECT_TYPES } from "@/domain/schemas";
import { PROJECT_TYPE_LABELS } from "@/domain/quotation";
import { useStore } from "@/lib/store/hooks";
import { toRows } from "@/lib/estimate-actions";
import { EstimatesTable } from "./estimates-table";

const STATUS_LABELS: Record<(typeof ESTIMATE_STATUSES)[number], string> = {
  draft: "Draft",
  in_review: "Awaiting review",
  approved: "Approved",
  quoted: "Quoted",
  archived: "Archived",
};

export function EstimatesList() {
  const { ready, estimates } = useStore();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("active");
  const [type, setType] = useState<string>("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = estimates.filter((e) => {
      if (status === "active" ? e.status === "archived" : status !== "all" && e.status !== status) return false;
      if (type !== "all" && e.project.projectType !== type) return false;
      const haystack = `${e.project.projectName} ${e.project.clientName} ${e.documents.map((d) => d.fileName).join(" ")}`.toLowerCase();
      return !q || haystack.includes(q);
    });
    return toRows(filtered).sort((a, b) => b.estimate.updatedAt.localeCompare(a.estimate.updatedAt));
  }, [estimates, query, status, type]);

  if (!ready) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Estimates"
        description="All projects and their current costing state. Prices are shown before VAT."
        actions={
          <LinkButton href="/estimates/new">
            <FilePlus2 /> New estimate
          </LinkButton>
        }
      />
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-72">
            <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search project, client or document" className="pl-8" aria-label="Search estimates" />
          </div>
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="active">All active</option>
            <option value="all">All, including archived</option>
            {ESTIMATE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by project type">
            <option value="all">All project types</option>
            {PROJECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {PROJECT_TYPE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
          <span className="ml-auto text-sm text-muted-foreground">{rows.length} estimate(s)</span>
        </div>
        <div className="rounded-lg border bg-background">
          {rows.length === 0 ? (
            <EmptyState title="No estimates match these filters" />
          ) : (
            <EstimatesTable rows={rows} />
          )}
        </div>
      </div>
    </div>
  );
}
