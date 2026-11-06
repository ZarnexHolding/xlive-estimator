import { AlertTriangle, CheckCircle2, CircleDashed, OctagonAlert, XCircle } from "lucide-react";
import type { EstimateStatus, Measurement } from "@/domain/schemas";
import { BASIS_LABELS } from "@/domain/measurements";
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  warning: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  danger: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
} as const;
export type Tone = keyof typeof TONES;

export function Pill({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

const STATUS: Record<EstimateStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  in_review: { label: "Awaiting review", tone: "info" },
  approved: { label: "Approved", tone: "success" },
  quoted: { label: "Quoted", tone: "success" },
  archived: { label: "Archived", tone: "neutral" },
};

export function EstimateStatusBadge({ status }: { status: EstimateStatus }) {
  return <Pill tone={STATUS[status].tone}>{STATUS[status].label}</Pill>;
}

export function ReadinessBadge({ ready, blocking }: { ready: boolean; blocking: number }) {
  return ready ? (
    <Pill tone="success">
      <CheckCircle2 className="size-3" aria-hidden /> Ready for quotation
    </Pill>
  ) : (
    <Pill tone="danger">
      <OctagonAlert className="size-3" aria-hidden /> Incomplete · {blocking} blocking
    </Pill>
  );
}

export function ReviewBadge({ status }: { status: Measurement["reviewStatus"] }) {
  if (status === "approved")
    return (
      <Pill tone="success">
        <CheckCircle2 className="size-3" aria-hidden /> Approved
      </Pill>
    );
  if (status === "rejected")
    return (
      <Pill tone="danger">
        <XCircle className="size-3" aria-hidden /> Rejected
      </Pill>
    );
  return (
    <Pill tone="warning">
      <CircleDashed className="size-3" aria-hidden /> Needs review
    </Pill>
  );
}

const BASIS_TONE: Record<Measurement["basis"], Tone> = {
  explicit_label: "success",
  derived: "info",
  grid_scale: "warning",
  visual_estimate: "warning",
  unresolved: "danger",
};

export function BasisBadge({ basis }: { basis: Measurement["basis"] }) {
  return <Pill tone={BASIS_TONE[basis]}>{BASIS_LABELS[basis]}</Pill>;
}

export function OriginBadge({ origin }: { origin: Measurement["origin"] }) {
  if (origin === "ai") return <Pill tone="info">AI extraction</Pill>;
  if (origin === "reference_analysis") return <Pill tone="neutral">Reference analysis · not AI</Pill>;
  return <Pill tone="neutral">Manual</Pill>;
}

export function IssueIcon({ severity }: { severity: "blocking" | "warning" }) {
  return severity === "blocking" ? (
    <OctagonAlert className="size-4 shrink-0 text-destructive" aria-label="Blocking" />
  ) : (
    <AlertTriangle className="size-4 shrink-0 text-warning" aria-label="Warning" />
  );
}
