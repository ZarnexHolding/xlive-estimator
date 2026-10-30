import { calculateEstimate } from "./costing/engine";
import type { Issue } from "./costing/types";
import type { Estimate, EstimateVersion } from "./estimate";

export class ApprovalError extends Error {
  constructor(
    message: string,
    readonly issues: Issue[] = [],
  ) {
    super(message);
    this.name = "ApprovalError";
  }
}

export interface ApprovalRequest {
  versionId: string;
  approvedBy: string;
  note: string;
  /** The approver confirms they have read the non-blocking warnings. */
  acknowledgeWarnings: boolean;
  at: string;
}

/**
 * Approve the current working estimate by freezing a complete snapshot of it.
 * The calculation is redone here, so a client-supplied total can never be approved.
 */
export function approveEstimate(estimate: Estimate, request: ApprovalRequest): Estimate {
  if (!request.approvedBy.trim()) throw new ApprovalError("Approver name is required.");
  const calculation = calculateEstimate(estimate.costing);
  const blocking = calculation.issues.filter((i) => i.severity === "blocking");
  if (blocking.length > 0 || !calculation.readyForQuotation) {
    throw new ApprovalError(`The estimate has ${blocking.length} blocking issue(s) and cannot be approved.`, blocking);
  }
  const warnings = calculation.issues.filter((i) => i.severity === "warning");
  if (warnings.length > 0 && !request.acknowledgeWarnings) {
    throw new ApprovalError(`${warnings.length} warning(s) must be acknowledged before approval.`, warnings);
  }
  const versionNo = Math.max(0, ...estimate.versions.map((v) => v.versionNo)) + 1;
  const version: EstimateVersion = structuredClone({
    id: request.versionId,
    versionNo,
    approvedAt: request.at,
    approvedBy: request.approvedBy.trim(),
    approvalNote: request.note,
    acknowledgedWarnings: warnings.map((w) => w.message),
    project: estimate.project,
    documents: estimate.documents,
    costing: estimate.costing,
    calculation,
  });
  return {
    ...estimate,
    status: "approved",
    versions: [...estimate.versions, version],
    updatedAt: request.at,
  };
}

/** Re-run the engine on a stored snapshot and confirm it still produces the stored totals. */
export function verifyVersion(version: EstimateVersion): { ok: boolean; recalculatedPrice: string | null } {
  const recalculated = calculateEstimate(version.costing);
  const ok =
    recalculated.directCost === version.calculation.directCost &&
    recalculated.costBase === version.calculation.costBase &&
    recalculated.sellingPriceExVat === version.calculation.sellingPriceExVat;
  return { ok, recalculatedPrice: recalculated.sellingPriceExVat };
}

export function latestVersion(estimate: Estimate): EstimateVersion | null {
  return estimate.versions.reduce<EstimateVersion | null>(
    (latest, v) => (latest === null || v.versionNo > latest.versionNo ? v : latest),
    null,
  );
}

/** Editing an approved or quoted estimate starts a new working draft; versions are kept. */
export function withDraftEdit(estimate: Estimate, at: string): Estimate {
  const status = estimate.status === "approved" || estimate.status === "quoted" ? "draft" : estimate.status;
  return { ...estimate, status, updatedAt: at };
}
