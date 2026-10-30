import type { Estimate } from "./estimate";
import { deriveQuantity } from "./measurements";
import type { CostingInput, LineItem, Measurement, ProjectInfo, Query } from "./schemas";

/** Builders with safe defaults. Ids and timestamps are always passed in, keeping these pure. */

export function makeQuery(id: string, text: string, at: string): Query {
  return { id, text, status: "open", resolution: null, createdAt: at, resolvedAt: null };
}

export function resolveQuery(q: Query, resolution: string, at: string): Query {
  if (!resolution.trim()) throw new Error("A resolution note is required to close a query.");
  return { ...q, status: "resolved", resolution: resolution.trim(), resolvedAt: at };
}

type MeasurementInit = Pick<Measurement, "id" | "componentName"> & Partial<Omit<Measurement, "id" | "componentName">>;

export function makeMeasurement(init: MeasurementInit): Measurement {
  const m: Measurement = {
    category: "",
    dimensions: { length: null, width: null, height: null, depth: null },
    derivation: null,
    quantity: null,
    unit: "each",
    sourceDocumentId: null,
    sourcePage: null,
    sourceLabels: [],
    basis: "unresolved",
    confidence: "low",
    reviewStatus: "unreviewed",
    origin: "manual",
    notes: "",
    assumptions: [],
    queries: [],
    reviewHistory: [],
    ...init,
  };
  const derived = deriveQuantity(m.dimensions, m.derivation);
  return derived ? { ...m, quantity: derived.quantity, unit: derived.unit } : m;
}

type LineInit = Pick<LineItem, "id" | "name"> & Partial<Omit<LineItem, "id" | "name">>;

export function makeLine(init: LineInit): LineItem {
  return {
    category: "",
    description: "",
    customerDescription: null,
    costType: "unclassified",
    supplyBasis: "produce",
    method: "quantity_x_rate",
    quantity: null,
    quantityUnit: "each",
    rate: null,
    rateUnit: "each",
    quantitySource: { kind: "manual", measurementId: null, note: "" },
    rateSource: { kind: "none", catalogueItemId: null, catalogueRateId: null, verification: null, note: "" },
    included: true,
    notes: "",
    queries: [],
    ...init,
  };
}

/**
 * Give every measurement, line, query and reconciliation a fresh id, keeping links consistent.
 * Ids are database keys, so a copied estimate must never reuse the original's ids.
 */
export function remapCostingIds(costing: CostingInput, newId: () => string, documentIds: ReadonlyMap<string, string | null> = new Map()): CostingInput {
  const measurementIds = new Map(costing.measurements.map((m) => [m.id, newId()]));
  const requeue = (qs: Query[]) => qs.map((q) => ({ ...q, id: newId() }));
  return {
    ...costing,
    measurements: costing.measurements.map((m) => ({
      ...m,
      id: measurementIds.get(m.id)!,
      sourceDocumentId: m.sourceDocumentId === null ? null : (documentIds.has(m.sourceDocumentId) ? documentIds.get(m.sourceDocumentId)! : m.sourceDocumentId),
      queries: requeue(m.queries),
    })),
    lineItems: costing.lineItems.map((l) => ({
      ...l,
      id: newId(),
      quantitySource: { ...l.quantitySource, measurementId: l.quantitySource.measurementId ? (measurementIds.get(l.quantitySource.measurementId) ?? null) : null },
      queries: requeue(l.queries),
    })),
    reconciliations: costing.reconciliations.map((r) => ({ ...r, id: newId() })),
    queries: requeue(costing.queries),
  };
}

export function emptyCosting(currency = "SAR"): CostingInput {
  return {
    currency,
    measurements: [],
    lineItems: [],
    pricing: { mode: "markup", markupRate: "0", marginRate: "0", fixedPrice: null, fixedPriceReason: "" },
    overhead: { mode: "not_set", value: null, note: "" },
    contingency: { mode: "not_set", value: null, note: "" },
    reconciliations: [],
    queries: [],
  };
}

export function newEstimate(args: { id: string; project: ProjectInfo; at: string; currency?: string }): Estimate {
  return {
    id: args.id,
    project: args.project,
    status: "draft",
    documents: [],
    analysisRuns: [],
    costing: emptyCosting(args.currency),
    versions: [],
    quotations: [],
    sample: null,
    createdAt: args.at,
    updatedAt: args.at,
  };
}
