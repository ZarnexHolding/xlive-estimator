import { z } from "zod";
import { MEASUREMENT_BASES, PROJECT_TYPES } from "@/domain/schemas";

/**
 * The structured output requested from the model. This is untrusted input: it is
 * re-validated with Zod and every measurement enters the app as "unreviewed".
 * Numbers are plain metres/counts; numeric range constraints are checked after parsing.
 */
export const ExtractedMeasurementSchema = z.object({
  componentName: z.string(),
  category: z.string(),
  length_m: z.number().nullable(),
  width_m: z.number().nullable(),
  height_m: z.number().nullable(),
  depth_m: z.number().nullable(),
  /** Which of the dimensions multiply together to give the quantity (empty for a count). */
  derivation_dims: z.array(z.enum(["length", "width", "height", "depth"])),
  /** Count of identical items / faces; 1 when not applicable. */
  multiplier: z.number(),
  /** The model's own stated quantity; the app recomputes it from dimensions where possible. */
  quantity: z.number().nullable(),
  unit: z.enum(["each", "lm", "m2", "m3", "kg"]),
  page: z.number().int().nullable(),
  sourceLabels: z.array(z.string()),
  basis: z.enum(MEASUREMENT_BASES),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string(),
  assumptions: z.array(z.string()),
});
export type ExtractedMeasurement = z.infer<typeof ExtractedMeasurementSchema>;

export const ExtractionResultSchema = z.object({
  projectType: z.enum(PROJECT_TYPES),
  projectTypeReason: z.string(),
  documentSummary: z.string(),
  pages: z.array(
    z.object({
      page: z.number().int(),
      kind: z.enum(["cover", "rendering", "floor_plan", "elevation", "annotated_rendering", "specification", "site_plan", "other"]),
      description: z.string(),
    }),
  ),
  measurements: z.array(ExtractedMeasurementSchema),
  conflicts: z.array(z.object({ description: z.string(), pages: z.array(z.number().int()) })),
  missingInformation: z.array(z.string()),
  questions: z.array(z.string()),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/** Checks the schema cannot express (ranges, page bounds). Returns problems found. */
export function checkExtractionBounds(result: ExtractionResult, pageCount: number | null): string[] {
  const problems: string[] = [];
  result.measurements.forEach((m, i) => {
    const label = `Measurement ${i + 1} ("${m.componentName}")`;
    for (const key of ["length_m", "width_m", "height_m", "depth_m", "quantity"] as const) {
      const v = m[key];
      if (v !== null && (!Number.isFinite(v) || v < 0 || v > 100_000)) problems.push(`${label}: ${key} out of range (${v}).`);
    }
    if (!Number.isFinite(m.multiplier) || m.multiplier < 0 || m.multiplier > 10_000) problems.push(`${label}: multiplier out of range.`);
    if (m.page !== null && (m.page < 1 || (pageCount !== null && m.page > pageCount))) problems.push(`${label}: page ${m.page} does not exist.`);
  });
  return problems;
}
