import { z } from "zod";
import { COST_TYPES, DecimalStringSchema, PricingModeSchema, UnitSchema } from "../schemas";

export const ENGINE_VERSION = "1.0.0";

export const ISSUE_CODES = [
  // Blocking: an estimate with any of these cannot be approved or quoted.
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
  // Warnings: shown and must be acknowledged on approval, but do not block.
  "ALLOWANCE_NOT_SET",
  "PROVISIONAL_RATE",
  "QUANTITY_BASIS_UNKNOWN",
  "LINE_EXCLUDED",
  "MEASUREMENT_QUANTITY_DIFFERS",
] as const;
export const IssueCodeSchema = z.enum(ISSUE_CODES);
export type IssueCode = z.infer<typeof IssueCodeSchema>;

export const IssueSchema = z.object({
  code: IssueCodeSchema,
  severity: z.enum(["blocking", "warning"]),
  message: z.string(),
  lineId: z.string().nullable(),
  measurementId: z.string().nullable(),
  queryId: z.string().nullable(),
});
export type Issue = z.infer<typeof IssueSchema>;

export const LineResultSchema = z.object({
  lineId: z.string(),
  /** Effective quantity used (from the measurement when linked). */
  quantity: DecimalStringSchema.nullable(),
  quantityUnit: UnitSchema,
  /** Rounded line amount, or null when it cannot be calculated (never 0 as a stand-in). */
  amount: DecimalStringSchema.nullable(),
  /** A human-readable trace of the calculation, e.g. "70 m² × 165.00 = 11,550.00". */
  formula: z.string(),
  issues: z.array(IssueSchema),
});
export type LineResult = z.infer<typeof LineResultSchema>;

export const AllowanceResultSchema = z.object({
  mode: z.enum(["not_set", "none", "percent", "fixed"]),
  base: DecimalStringSchema,
  amount: DecimalStringSchema,
});

export const PricingResultSchema = z.object({
  mode: PricingModeSchema,
  /** The configured rate (fraction) for markup/margin; null for fixed price. */
  rate: DecimalStringSchema.nullable(),
  sellingPrice: DecimalStringSchema.nullable(),
  profit: DecimalStringSchema.nullable(),
  effectiveMarkup: DecimalStringSchema.nullable(),
  effectiveMargin: DecimalStringSchema.nullable(),
});
export type PricingResult = z.infer<typeof PricingResultSchema>;

export const ReconciliationResultSchema = z.object({
  id: z.string(),
  label: z.string(),
  reportedTotal: DecimalStringSchema,
  calculatedTotal: DecimalStringSchema,
  difference: DecimalStringSchema,
  status: z.enum(["reconciled", "explained", "unresolved"]),
});
export type ReconciliationResult = z.infer<typeof ReconciliationResultSchema>;

export const EstimateCalculationSchema = z.object({
  engineVersion: z.string(),
  currency: z.string(),
  lines: z.array(LineResultSchema),
  directCost: DecimalStringSchema,
  byCostType: z.record(z.enum(COST_TYPES), DecimalStringSchema),
  byCategory: z.array(z.object({ category: z.string(), amount: DecimalStringSchema })),
  overhead: AllowanceResultSchema,
  contingency: AllowanceResultSchema,
  costBase: DecimalStringSchema,
  pricing: PricingResultSchema,
  /** Pre-VAT selling price. VAT is never added in the estimating workflow. */
  sellingPriceExVat: DecimalStringSchema.nullable(),
  reconciliations: z.array(ReconciliationResultSchema),
  issues: z.array(IssueSchema),
  blockingCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  /** Lines that were included but could not be calculated (amount null). */
  uncalculatedLineCount: z.number().int().nonnegative(),
  readyForQuotation: z.boolean(),
});
export type EstimateCalculation = z.infer<typeof EstimateCalculationSchema>;
