"use client";

import { calculateEstimate } from "@/domain/costing/engine";
import type { EstimateCalculation } from "@/domain/costing/types";
import type { Estimate } from "@/domain/estimate";
import { remapCostingIds } from "@/domain/factories";
import { latestVersion } from "@/domain/versioning";
import { newId } from "./ids";
import { appStore } from "./store";

/**
 * Copy an estimate's project details and costing into a new draft. Every record gets a new id.
 * Documents and analysis runs are not copied (files belong to the original); measurement
 * page references are kept as text.
 */
export async function duplicateEstimate(source: Estimate): Promise<Estimate> {
  const at = new Date().toISOString();
  const copy: Estimate = {
    ...structuredClone(source),
    id: newId(),
    project: { ...source.project, projectName: `${source.project.projectName} (copy)` },
    status: "draft",
    documents: [],
    analysisRuns: [],
    costing: remapCostingIds(structuredClone(source.costing), newId, new Map(source.documents.map((d) => [d.id, null]))),
    versions: [],
    quotations: [],
    sample: null,
    createdAt: at,
    updatedAt: at,
  };
  await appStore.saveEstimate(copy);
  return copy;
}

export const deleteEstimate = (estimate: Estimate) => appStore.deleteEstimate(estimate);

export interface EstimateRow {
  estimate: Estimate;
  calc: EstimateCalculation;
  /** Selling price of the latest approved version, if any (the figure that may be quoted). */
  approvedPrice: string | null;
}

export function toRows(estimates: Estimate[]): EstimateRow[] {
  return estimates.map((estimate) => ({
    estimate,
    calc: calculateEstimate(estimate.costing),
    approvedPrice: latestVersion(estimate)?.calculation.sellingPriceExVat ?? null,
  }));
}
