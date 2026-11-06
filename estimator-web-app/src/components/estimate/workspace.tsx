"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { EstimateStatusBadge, Pill, ReadinessBadge } from "@/components/common/badges";
import { EmptyState, LoadingBlock } from "@/components/common/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { calculateEstimate } from "@/domain/costing/engine";
import type { EstimateCalculation } from "@/domain/costing/types";
import type { Estimate } from "@/domain/estimate";
import { useEstimate, useUpdateEstimate, type EstimateRecipe } from "@/lib/store/hooks";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ApprovalStep } from "./steps/approval-step";
import { CostingStep } from "./steps/costing-step";
import { DocumentsStep } from "./steps/documents-step";
import { ProjectStep } from "./steps/project-step";
import { QuotationStep } from "./steps/quotation-step";
import { ReviewStep } from "./steps/review-step";
import { useAnalysisJobs } from "./use-analysis-jobs";

export interface StepProps {
  estimate: Estimate;
  calc: EstimateCalculation;
  update: (recipe: EstimateRecipe, options?: { contentEdit?: boolean }) => boolean;
  goTo: (step: StepKey) => void;
}

const STEPS = [
  { key: "project", label: "Project" },
  { key: "documents", label: "Documents" },
  { key: "review", label: "Measurements" },
  { key: "costing", label: "Costing" },
  { key: "approval", label: "Review & approve" },
  { key: "quotation", label: "Quotation" },
] as const;
export type StepKey = (typeof STEPS)[number]["key"];

function stepDone(key: StepKey, e: Estimate, calc: EstimateCalculation): boolean {
  switch (key) {
    case "project":
      return e.project.projectName.trim() !== "" && e.project.clientName.trim() !== "";
    case "documents":
      return e.documents.length > 0;
    case "review":
      return e.costing.measurements.length > 0 && e.costing.measurements.every((m) => m.reviewStatus !== "unreviewed");
    case "costing":
      return e.costing.lineItems.length > 0 && calc.uncalculatedLineCount === 0;
    case "approval":
      return e.versions.length > 0;
    case "quotation":
      return e.quotations.length > 0;
  }
}

export function EstimateWorkspace({ id }: { id: string }) {
  const { ready, estimate } = useEstimate(id);
  const update = useUpdateEstimate(id);
  // Deep links: /estimates/[id]?step=costing
  const requested = useSearchParams().get("step");
  const [step, setStep] = useState<StepKey>(() => STEPS.find((s) => s.key === requested)?.key ?? "project");
  const goTo = (key: StepKey) => {
    setStep(key);
    const url = new URL(window.location.href);
    url.searchParams.set("step", key);
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0 });
  };

  const calc = useMemo(() => (estimate ? calculateEstimate(estimate.costing) : null), [estimate]);
  // Background AI analyses: imported when ready, whichever step is open.
  useAnalysisJobs(estimate ?? null, update, () => {
    if (step === "documents") goTo("review");
  });

  if (!ready) return <LoadingBlock />;
  if (!estimate || !calc) {
    return (
      <div className="p-6">
        <EmptyState title="Estimate not found" action={<LinkButton href="/estimates">Back to estimates</LinkButton>}>
          It may have been deleted, or it was created in a different browser (demo mode stores data per browser).
        </EmptyState>
      </div>
    );
  }

  const props: StepProps = { estimate, calc, update, goTo };
  const currency = estimate.costing.currency;

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b bg-background px-6 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              <Link href="/estimates" className="hover:underline">
                Estimates
              </Link>{" "}
              / {estimate.project.clientName || "No client"}
            </p>
            <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight">{estimate.project.projectName}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <EstimateStatusBadge status={estimate.status} />
              <ReadinessBadge ready={calc.readyForQuotation} blocking={calc.blockingCount} />
              {calc.warningCount > 0 && <Pill tone="warning">{calc.warningCount} warning(s)</Pill>}
              {estimate.versions.length > 0 && <Pill>Latest approved: v{Math.max(...estimate.versions.map((v) => v.versionNo))}</Pill>}
              {estimate.sample && <Pill>Demo sample · provisional reference data</Pill>}
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-right text-sm">
            <dt className="text-xs text-muted-foreground">{calc.uncalculatedLineCount > 0 ? "Partial direct cost" : "Direct cost"}</dt>
            <dt className="text-xs text-muted-foreground">{calc.uncalculatedLineCount > 0 ? "Partial selling price (ex VAT)" : "Selling price (ex VAT)"}</dt>
            <dd className="font-mono font-medium tabular-nums">{formatMoney(calc.directCost, currency)}</dd>
            <dd className="font-mono font-medium tabular-nums">{formatMoney(calc.sellingPriceExVat, currency)}</dd>
            {calc.uncalculatedLineCount > 0 && (
              <dd className="col-span-2 text-xs text-destructive">{calc.uncalculatedLineCount} line(s) not calculated and excluded from these totals</dd>
            )}
          </dl>
        </div>
        <nav className="mt-4 -mb-px flex gap-1 overflow-x-auto" aria-label="Estimate workflow">
          {STEPS.map((s, i) => {
            const done = stepDone(s.key, estimate, calc);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => goTo(s.key)}
                aria-current={step === s.key ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
                  step === s.key ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border text-[11px] tabular-nums",
                    done ? "border-emerald-600 bg-emerald-600 text-white" : "border-border",
                  )}
                  aria-hidden
                >
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                {s.label}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="flex-1">
        {step === "project" && <ProjectStep {...props} />}
        {step === "documents" && <DocumentsStep {...props} />}
        {step === "review" && <ReviewStep {...props} />}
        {step === "costing" && <CostingStep {...props} />}
        {step === "approval" && <ApprovalStep {...props} />}
        {step === "quotation" && <QuotationStep {...props} />}
      </div>
    </div>
  );
}
