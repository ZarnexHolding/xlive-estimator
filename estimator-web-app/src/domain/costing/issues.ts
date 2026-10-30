import type { Issue, IssueCode } from "./types";

const BLOCKING: ReadonlySet<IssueCode> = new Set<IssueCode>([
  "PRICE_NOT_CONFIGURED",
  "QUANTITY_MISSING",
  "UNIT_MISMATCH",
  "UNIT_TBC",
  "MEASUREMENT_NOT_FOUND",
  "MEASUREMENT_NOT_APPROVED",
  "MEASUREMENT_REJECTED",
  "OPEN_QUERY",
  "RECONCILIATION_UNRESOLVED",
  "INVALID_PRICING",
  "INVALID_LINE",
  "INVALID_ALLOWANCE",
  "CLIENT_SUPPLIED_HAS_COST",
  "NO_LINES",
]);

export function isBlocking(code: IssueCode): boolean {
  return BLOCKING.has(code);
}

export function issue(
  code: IssueCode,
  message: string,
  refs: { lineId?: string; measurementId?: string; queryId?: string } = {},
): Issue {
  return {
    code,
    severity: isBlocking(code) ? "blocking" : "warning",
    message,
    lineId: refs.lineId ?? null,
    measurementId: refs.measurementId ?? null,
    queryId: refs.queryId ?? null,
  };
}

export const ISSUE_TITLES: Record<IssueCode, string> = {
  PRICE_NOT_CONFIGURED: "Price not configured",
  QUANTITY_MISSING: "Quantity missing",
  UNIT_MISMATCH: "Unit mismatch",
  UNIT_TBC: "Unit to be confirmed",
  MEASUREMENT_NOT_FOUND: "Linked measurement missing",
  MEASUREMENT_NOT_APPROVED: "Measurement not approved",
  MEASUREMENT_REJECTED: "Measurement rejected",
  OPEN_QUERY: "Open query",
  RECONCILIATION_UNRESOLVED: "Unreconciled difference",
  INVALID_PRICING: "Invalid pricing",
  INVALID_LINE: "Invalid line",
  INVALID_ALLOWANCE: "Invalid allowance",
  CLIENT_SUPPLIED_HAS_COST: "Client-supplied item has a cost",
  NO_LINES: "No cost lines",
  ALLOWANCE_NOT_SET: "Allowance not set",
  PROVISIONAL_RATE: "Provisional rate",
  QUANTITY_BASIS_UNKNOWN: "Quantity basis unknown",
  LINE_EXCLUDED: "Line excluded",
  MEASUREMENT_QUANTITY_DIFFERS: "Quantity differs from dimensions",
};
