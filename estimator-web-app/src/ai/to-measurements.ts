import { makeMeasurement, makeQuery } from "@/domain/factories";
import { deriveQuantity } from "@/domain/measurements";
import { D } from "@/domain/money";
import type { Measurement, Query } from "@/domain/schemas";
import type { ExtractedMeasurement, ExtractionResult } from "./extraction-schema";

const toDec = (n: number | null): string | null =>
  n === null ? null : new D(n.toString()).toDecimalPlaces(4).toString();

/**
 * Convert validated AI output into reviewable measurements. Quantities are recomputed
 * deterministically from the dimensions; if the model's figure disagrees, the recomputed
 * value is used and the discrepancy is recorded. Every item starts "unreviewed".
 */
export function extractionToMeasurements(
  result: ExtractionResult,
  ctx: { documentId: string; newId: () => string; at: string },
): { measurements: Measurement[]; queries: Query[] } {
  const measurements = result.measurements.map((x: ExtractedMeasurement) => {
    const dimensions = { length: toDec(x.length_m), width: toDec(x.width_m), height: toDec(x.height_m), depth: toDec(x.depth_m) };
    // Dimensions × multiplier, or a plain count. A stated area/length without dimensions has no derivation.
    const isCount = x.derivation_dims.length === 0 && x.unit === "each";
    const derivation =
      x.basis !== "unresolved" && (x.derivation_dims.length > 0 || isCount)
        ? { dims: [...new Set(x.derivation_dims)].slice(0, 3), multiplier: toDec(x.multiplier) ?? "1" }
        : null;
    const recomputed = deriveQuantity(dimensions, derivation);
    const stated = toDec(x.quantity);
    const notes = [x.notes];
    let quantity = stated;
    let unit: Measurement["unit"] = x.unit;
    if (recomputed) {
      if (stated !== null && !new D(stated).equals(new D(recomputed.quantity))) {
        notes.push(`AI stated ${stated} ${x.unit}; recomputed ${recomputed.quantity} from the dimensions, and the recomputed value is used.`);
      }
      quantity = recomputed.quantity;
      unit = recomputed.unit;
    }
    return makeMeasurement({
      id: ctx.newId(),
      componentName: x.componentName,
      category: x.category,
      dimensions,
      // Keep the derivation only when it reproduces a quantity; otherwise treat the figure as stated.
      derivation: recomputed ? derivation : null,
      quantity: x.basis === "unresolved" ? null : quantity,
      unit,
      sourceDocumentId: ctx.documentId,
      sourcePage: x.page,
      sourceLabels: x.sourceLabels,
      basis: x.basis,
      confidence: x.confidence,
      origin: "ai",
      notes: notes.filter(Boolean).join(" "),
      assumptions: x.assumptions,
      reviewHistory: [{ at: ctx.at, action: "created", reason: "Extracted by AI analysis" }],
    });
  });

  const queries = [
    ...result.conflicts.map((c) =>
      makeQuery(ctx.newId(), `Conflict${c.pages.length ? ` (pages ${c.pages.join(", ")})` : ""}: ${c.description}`, ctx.at),
    ),
    ...result.questions.map((q) => makeQuery(ctx.newId(), q, ctx.at)),
  ];
  return { measurements, queries };
}
