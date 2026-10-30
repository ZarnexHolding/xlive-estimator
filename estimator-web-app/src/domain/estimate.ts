import { z } from "zod";
import { EstimateCalculationSchema } from "./costing/types";
import {
  AnalysisRunSchema,
  CostingInputSchema,
  CurrencySchema,
  DecimalStringSchema,
  DocumentRefSchema,
  EstimateStatusSchema,
  IsoDateTimeSchema,
  ProjectInfoSchema,
} from "./schemas";
import { CompanySettingsSchema } from "./settings";

/** An immutable approved snapshot. Nothing in it may change after creation. */
export const EstimateVersionSchema = z.object({
  id: z.string(),
  versionNo: z.number().int().positive(),
  approvedAt: IsoDateTimeSchema,
  approvedBy: z.string().min(1),
  approvalNote: z.string(),
  /** Warning messages the approver acknowledged at approval time. */
  acknowledgedWarnings: z.array(z.string()),
  project: ProjectInfoSchema,
  documents: z.array(DocumentRefSchema),
  costing: CostingInputSchema,
  calculation: EstimateCalculationSchema,
});
export type EstimateVersion = z.infer<typeof EstimateVersionSchema>;

export const QuotationRecordSchema = z.object({
  id: z.string(),
  number: z.string(),
  versionId: z.string(),
  versionNo: z.number().int().positive(),
  issueDate: z.string(),
  validUntil: z.string(),
  totalExVat: DecimalStringSchema,
  currency: CurrencySchema,
  vatTreatment: z.literal("excluded"),
  format: z.literal("summary"),
  /** Company details and terms as printed, so a re-download reproduces the issued document. */
  settingsSnapshot: CompanySettingsSchema,
  createdAt: IsoDateTimeSchema,
});
export type QuotationRecord = z.infer<typeof QuotationRecordSchema>;

export const SAMPLE_KEYS = ["emdad", "idcube", "smc"] as const;

export const EstimateSchema = z.object({
  id: z.string(),
  project: ProjectInfoSchema,
  status: EstimateStatusSchema,
  documents: z.array(DocumentRefSchema),
  analysisRuns: z.array(AnalysisRunSchema),
  costing: CostingInputSchema,
  versions: z.array(EstimateVersionSchema),
  quotations: z.array(QuotationRecordSchema),
  /** Set on the clearly labelled demo samples built from the reference documents. */
  sample: z.enum(SAMPLE_KEYS).nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Estimate = z.infer<typeof EstimateSchema>;
