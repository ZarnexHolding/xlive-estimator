import { z } from "zod";
import { UNITS } from "./units";

/**
 * Domain schemas. Every object that crosses a trust boundary (browser storage,
 * database, AI output, API request) is parsed with these before use.
 */

export const DecimalStringSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "Must be a plain decimal number");
export const NonNegativeDecimalSchema = DecimalStringSchema.refine(
  (v) => !v.startsWith("-"),
  "Must not be negative",
);

export const UnitSchema = z.enum(UNITS);
export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/, "ISO 4217 code, e.g. SAR");
export const IsoDateTimeSchema = z.string().min(10);

// ---------------------------------------------------------------------------
// Queries (open clarification questions)

export const QuerySchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  status: z.enum(["open", "resolved"]),
  resolution: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  resolvedAt: IsoDateTimeSchema.nullable(),
});
export type Query = z.infer<typeof QuerySchema>;

// ---------------------------------------------------------------------------
// Measurements

export const MEASUREMENT_BASES = [
  "explicit_label",
  "derived",
  "grid_scale",
  "visual_estimate",
  "unresolved",
] as const;
export const MeasurementBasisSchema = z.enum(MEASUREMENT_BASES);
export type MeasurementBasis = z.infer<typeof MeasurementBasisSchema>;

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const ReviewStatusSchema = z.enum(["unreviewed", "approved", "rejected"]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const MeasurementOriginSchema = z.enum(["ai", "manual", "reference_analysis"]);
export type MeasurementOrigin = z.infer<typeof MeasurementOriginSchema>;

export const DIMENSION_KEYS = ["length", "width", "height", "depth"] as const;
export const DimensionKeySchema = z.enum(DIMENSION_KEYS);
export type DimensionKey = z.infer<typeof DimensionKeySchema>;

/** All dimensions are in metres. */
export const DimensionsSchema = z.object({
  length: NonNegativeDecimalSchema.nullable(),
  width: NonNegativeDecimalSchema.nullable(),
  height: NonNegativeDecimalSchema.nullable(),
  depth: NonNegativeDecimalSchema.nullable(),
});
export type Dimensions = z.infer<typeof DimensionsSchema>;

/** quantity = product(dims) × multiplier. No dims = a plain count of `multiplier`. */
export const DerivationSchema = z.object({
  dims: z.array(DimensionKeySchema).max(3),
  multiplier: NonNegativeDecimalSchema,
});
export type Derivation = z.infer<typeof DerivationSchema>;

export const ReviewEventSchema = z.object({
  at: IsoDateTimeSchema,
  action: z.enum(["approved", "rejected", "edited", "reopened", "created"]),
  reason: z.string(),
  changes: z.record(z.string(), z.object({ from: z.unknown(), to: z.unknown() })).optional(),
});
export type ReviewEvent = z.infer<typeof ReviewEventSchema>;

export const MeasurementSchema = z.object({
  id: z.string(),
  componentName: z.string().min(1),
  category: z.string(),
  dimensions: DimensionsSchema,
  derivation: DerivationSchema.nullable(),
  quantity: NonNegativeDecimalSchema.nullable(),
  unit: UnitSchema,
  sourceDocumentId: z.string().nullable(),
  sourcePage: z.number().int().positive().nullable(),
  sourceLabels: z.array(z.string()),
  basis: MeasurementBasisSchema,
  confidence: ConfidenceSchema,
  reviewStatus: ReviewStatusSchema,
  origin: MeasurementOriginSchema,
  notes: z.string(),
  assumptions: z.array(z.string()),
  queries: z.array(QuerySchema),
  reviewHistory: z.array(ReviewEventSchema),
});
export type Measurement = z.infer<typeof MeasurementSchema>;

// ---------------------------------------------------------------------------
// Line items

export const COST_TYPES = [
  "material",
  "labour",
  "equipment_rental",
  "subcontract",
  "transport",
  "other",
  "unclassified",
] as const;
export const CostTypeSchema = z.enum(COST_TYPES);
export type CostType = z.infer<typeof CostTypeSchema>;

export const SupplyBasisSchema = z.enum(["produce", "rent", "reuse", "client_supplied"]);
export type SupplyBasis = z.infer<typeof SupplyBasisSchema>;

export const CalculationMethodSchema = z.enum(["quantity_x_rate", "lump_sum"]);
export type CalculationMethod = z.infer<typeof CalculationMethodSchema>;

export const QuantitySourceSchema = z.object({
  kind: z.enum(["measurement", "manual", "reference"]),
  measurementId: z.string().nullable(),
  note: z.string(),
});
export type QuantitySource = z.infer<typeof QuantitySourceSchema>;

export const RateVerificationSchema = z.enum(["verified", "provisional"]);
export type RateVerification = z.infer<typeof RateVerificationSchema>;

export const RateSourceSchema = z.object({
  kind: z.enum(["catalogue", "manual", "reference", "none"]),
  catalogueItemId: z.string().nullable(),
  catalogueRateId: z.string().nullable(),
  verification: RateVerificationSchema.nullable(),
  note: z.string(),
});
export type RateSource = z.infer<typeof RateSourceSchema>;

export const LineItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  /** Trade or element category, e.g. "Flooring", "LED & AV". */
  category: z.string(),
  description: z.string(),
  /** Text used on the customer quotation; falls back to `name`. */
  customerDescription: z.string().nullable(),
  costType: CostTypeSchema,
  supplyBasis: SupplyBasisSchema,
  method: CalculationMethodSchema,
  /** Ignored when quantitySource.kind === "measurement" (taken from the measurement). */
  quantity: NonNegativeDecimalSchema.nullable(),
  quantityUnit: UnitSchema,
  /** Unit rate for quantity_x_rate; the fixed amount for lump_sum. */
  rate: NonNegativeDecimalSchema.nullable(),
  rateUnit: UnitSchema,
  quantitySource: QuantitySourceSchema,
  rateSource: RateSourceSchema,
  included: z.boolean(),
  notes: z.string(),
  queries: z.array(QuerySchema),
});
export type LineItem = z.infer<typeof LineItemSchema>;

// ---------------------------------------------------------------------------
// Estimate-level configuration

export const AllowanceSchema = z.object({
  mode: z.enum(["not_set", "none", "percent", "fixed"]),
  /** Fraction for percent (0.05 = 5 %), amount for fixed. */
  value: NonNegativeDecimalSchema.nullable(),
  note: z.string(),
});
export type Allowance = z.infer<typeof AllowanceSchema>;

export const PricingModeSchema = z.enum(["markup", "margin", "fixed_price"]);
export type PricingMode = z.infer<typeof PricingModeSchema>;

export const PricingConfigSchema = z.object({
  mode: PricingModeSchema,
  /** Fraction: 0.30 = 30 % markup on cost. */
  markupRate: NonNegativeDecimalSchema,
  /** Fraction: 0.30 = 30 % gross margin on selling price. */
  marginRate: NonNegativeDecimalSchema,
  fixedPrice: NonNegativeDecimalSchema.nullable(),
  fixedPriceReason: z.string(),
});
export type PricingConfig = z.infer<typeof PricingConfigSchema>;

export const ReconciliationSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  reportedTotal: NonNegativeDecimalSchema,
  source: z.string(),
  /** An estimator's recorded explanation; when present the difference is "explained". */
  explanation: z.string().nullable(),
});
export type Reconciliation = z.infer<typeof ReconciliationSchema>;

export const PROJECT_TYPES = [
  "exhibition_booth",
  "custom_display_stand",
  "led_stage_or_runway",
  "retail_display",
  "brand_activation",
  "custom_installation",
  "other_event_production",
] as const;
export const ProjectTypeSchema = z.enum(PROJECT_TYPES);
export type ProjectType = z.infer<typeof ProjectTypeSchema>;

export const DocumentRefSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  sha256: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  pageCount: z.number().int().positive().nullable(),
  uploadedAt: IsoDateTimeSchema,
  storage: z.enum(["browser", "supabase"]),
});
export type DocumentRef = z.infer<typeof DocumentRefSchema>;

export const AnalysisRunSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  provider: z.enum(["anthropic", "reference_analysis"]),
  model: z.string().nullable(),
  status: z.enum(["running", "awaiting_review", "failed"]),
  startedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.nullable(),
  error: z.string().nullable(),
  summary: z.string().nullable(),
  projectTypeSuggestion: ProjectTypeSchema.nullable(),
  measurementCount: z.number().int().nonnegative(),
});
export type AnalysisRun = z.infer<typeof AnalysisRunSchema>;

export const ESTIMATE_STATUSES = ["draft", "in_review", "approved", "quoted", "archived"] as const;
export const EstimateStatusSchema = z.enum(ESTIMATE_STATUSES);
export type EstimateStatus = z.infer<typeof EstimateStatusSchema>;

/** The subset of an estimate that determines its cost. Snapshotted on approval. */
export const CostingInputSchema = z.object({
  currency: CurrencySchema,
  measurements: z.array(MeasurementSchema),
  lineItems: z.array(LineItemSchema),
  pricing: PricingConfigSchema,
  overhead: AllowanceSchema,
  contingency: AllowanceSchema,
  reconciliations: z.array(ReconciliationSchema),
  queries: z.array(QuerySchema),
});
export type CostingInput = z.infer<typeof CostingInputSchema>;

export const ProjectInfoSchema = z.object({
  projectName: z.string().min(1),
  clientName: z.string(),
  projectType: ProjectTypeSchema,
  venue: z.string(),
  eventDates: z.string(),
  estimator: z.string(),
  notes: z.string(),
});
export type ProjectInfo = z.infer<typeof ProjectInfoSchema>;
