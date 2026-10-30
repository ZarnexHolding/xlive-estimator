import { emptyCosting, remapCostingIds } from "@/domain/factories";
import type { ReferenceKey } from "@/domain/reference-data/documents";
import { emdadMeasurements } from "@/domain/reference-data/emdad";
import { idcubeMeasurements } from "@/domain/reference-data/idcube";
import { smcMeasurements } from "@/domain/reference-data/smc";
import type { Measurement } from "@/domain/schemas";

/**
 * The developer-prepared extraction of a reference PDF (docs/reference-document-analysis.md),
 * with fresh ids. Offered only for recognised reference files and labelled "Reference analysis · not AI".
 */
export function referenceExtraction(key: ReferenceKey, documentId: string, newId: () => string): Measurement[] {
  const source = key === "emdad" ? emdadMeasurements() : key === "idcube" ? idcubeMeasurements() : smcMeasurements();
  const remapped = remapCostingIds({ ...emptyCosting(), measurements: source }, newId);
  return remapped.measurements.map((m) => ({ ...m, sourceDocumentId: documentId }));
}
