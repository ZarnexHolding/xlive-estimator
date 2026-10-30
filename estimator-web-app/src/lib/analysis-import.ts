import { extractionToMeasurements } from "@/ai/to-measurements";
import type { AnalysisResult } from "@/lib/analysis-client";
import { newId } from "@/lib/ids";
import type { EstimateRecipe } from "@/lib/store/hooks";

/**
 * Adds an analysis result to the estimate as unreviewed measurements and estimate-level queries,
 * and completes its run. Only a run that is still running is completed, so a result is never
 * imported twice.
 */
export function importAnalysisResult(runId: string, documentId: string, output: AnalysisResult): EstimateRecipe {
  return (e) => {
    if (!e.analysisRuns.some((r) => r.id === runId && r.status === "running")) return e;
    const at = new Date().toISOString();
    const { measurements, queries } = extractionToMeasurements(output.result, { documentId, newId: () => newId(), at });
    const warningNote = output.warnings.length ? ` Validation notes: ${output.warnings.join(" ")}` : "";
    return {
      ...e,
      status: e.status === "draft" ? "in_review" : e.status,
      costing: { ...e.costing, measurements: [...e.costing.measurements, ...measurements], queries: [...e.costing.queries, ...queries] },
      analysisRuns: e.analysisRuns.map((r) =>
        r.id === runId
          ? {
              ...r,
              status: "awaiting_review",
              model: output.model,
              completedAt: at,
              summary: `${output.result.documentSummary}${warningNote}`,
              projectTypeSuggestion: output.result.projectType,
              measurementCount: measurements.length,
            }
          : r,
      ),
    };
  };
}

export function failAnalysisRun(runId: string, message: string): EstimateRecipe {
  return (e) => ({
    ...e,
    analysisRuns: e.analysisRuns.map((r) => (r.id === runId && r.status === "running" ? { ...r, status: "failed", completedAt: new Date().toISOString(), error: message } : r)),
  });
}
