import { z } from "zod";
import {
  CostTypeSchema,
  CurrencySchema,
  IsoDateTimeSchema,
  NonNegativeDecimalSchema,
  RateVerificationSchema,
  UnitSchema,
  type LineItem,
} from "./schemas";

/** One price version. Rates are append-only: a price change adds a new version. */
export const CatalogueRateSchema = z.object({
  id: z.string(),
  rate: NonNegativeDecimalSchema,
  currency: CurrencySchema,
  verification: RateVerificationSchema,
  source: z.string(),
  /** YYYY-MM-DD */
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recordedAt: IsoDateTimeSchema,
});
export type CatalogueRate = z.infer<typeof CatalogueRateSchema>;

export const CatalogueItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  category: z.string(),
  unit: UnitSchema,
  costType: CostTypeSchema,
  supplier: z.string(),
  notes: z.string(),
  active: z.boolean(),
  /** Optional material specification for future sheet-based calculations. */
  specs: z.object({
    thicknessMm: NonNegativeDecimalSchema.nullable(),
    sheetLengthMm: NonNegativeDecimalSchema.nullable(),
    sheetWidthMm: NonNegativeDecimalSchema.nullable(),
  }),
  rates: z.array(CatalogueRateSchema),
  updatedAt: IsoDateTimeSchema,
});
export type CatalogueItem = z.infer<typeof CatalogueItemSchema>;

/** The rate in force on `asOf` (YYYY-MM-DD): latest effective date, then latest recorded. */
export function currentRate(item: CatalogueItem, asOf: string): CatalogueRate | null {
  const eligible = item.rates.filter((r) => r.effectiveFrom <= asOf);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, r) =>
    r.effectiveFrom > best.effectiveFrom ||
    (r.effectiveFrom === best.effectiveFrom && r.recordedAt > best.recordedAt)
      ? r
      : best,
  );
}

/** Record a new price version. Existing versions (and estimates that copied them) are untouched. */
export function addRateVersion(item: CatalogueItem, rate: CatalogueRate): CatalogueItem {
  if (item.rates.some((r) => r.id === rate.id)) throw new Error(`Rate version ${rate.id} already exists`);
  return { ...item, rates: [...item.rates, CatalogueRateSchema.parse(rate)], updatedAt: rate.recordedAt };
}

/**
 * Copy a catalogue rate onto a draft line. The value is copied (not referenced) so later
 * catalogue changes cannot alter this line; the ids are kept for traceability.
 * Unit compatibility is checked by the costing engine (UNIT_MISMATCH), not silently fixed here.
 */
export function applyCatalogueRate(line: LineItem, item: CatalogueItem, asOf: string): LineItem {
  const rate = currentRate(item, asOf);
  if (!rate) throw new Error(`"${item.name}" has no rate effective on ${asOf}`);
  const isLump = item.unit === "lump_sum";
  return {
    ...line,
    method: isLump ? "lump_sum" : "quantity_x_rate",
    quantityUnit: isLump ? "lump_sum" : line.quantityUnit,
    rate: rate.rate,
    rateUnit: item.unit,
    costType: line.costType === "unclassified" ? item.costType : line.costType,
    rateSource: {
      kind: "catalogue",
      catalogueItemId: item.id,
      catalogueRateId: rate.id,
      verification: rate.verification,
      note: `${item.name}: ${rate.source} (effective ${rate.effectiveFrom})`,
    },
  };
}

const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

/**
 * Deterministic catalogue suggestions for a line: name-token overlap, with a bonus for a
 * matching unit. Suggestions are only ever applied by an explicit user action.
 */
export function suggestCatalogueItems(
  line: Pick<LineItem, "name" | "category" | "quantityUnit">,
  items: CatalogueItem[],
  limit = 5,
): { item: CatalogueItem; score: number; unitMatches: boolean }[] {
  const wanted = new Set([...tokens(line.name), ...tokens(line.category)]);
  return items
    .filter((i) => i.active)
    .map((item) => {
      const have = tokens(`${item.name} ${item.category}`);
      const overlap = have.filter((t) => wanted.has(t)).length;
      const unitMatches = item.unit === line.quantityUnit || item.unit === "lump_sum";
      return { item, score: overlap * 2 + (unitMatches ? 1 : 0), unitMatches };
    })
    .filter((s) => s.score > 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
