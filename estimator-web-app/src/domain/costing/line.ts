import { dec, moneyString, round2, type Dec } from "../money";
import type { LineItem, Measurement } from "../schemas";
import { UNIT_LABELS } from "../units";
import { issue } from "./issues";
import type { Issue, LineResult } from "./types";

const fmt = (d: Dec) => d.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Resolve the quantity a line should use: its own, or its linked measurement's. */
function effectiveQuantity(
  line: LineItem,
  measurements: ReadonlyMap<string, Measurement>,
  issues: Issue[],
): { quantity: string | null; unit: LineItem["quantityUnit"] } {
  if (line.quantitySource.kind !== "measurement") {
    return { quantity: line.quantity, unit: line.quantityUnit };
  }
  const id = line.quantitySource.measurementId;
  const m = id ? measurements.get(id) : undefined;
  if (!m) {
    issues.push(issue("MEASUREMENT_NOT_FOUND", `"${line.name}" is linked to a measurement that no longer exists.`, { lineId: line.id }));
    return { quantity: null, unit: line.quantityUnit };
  }
  if (m.reviewStatus === "rejected") {
    issues.push(issue("MEASUREMENT_REJECTED", `"${line.name}" uses "${m.componentName}", which was rejected by the estimator.`, { lineId: line.id, measurementId: m.id }));
  } else if (m.reviewStatus !== "approved") {
    issues.push(issue("MEASUREMENT_NOT_APPROVED", `"${line.name}" uses "${m.componentName}", which has not been approved yet.`, { lineId: line.id, measurementId: m.id }));
  }
  return { quantity: m.quantity, unit: m.unit };
}

/**
 * Calculate one line. Pure and deterministic. The amount is null whenever it
 * cannot be calculated honestly; it is never replaced by zero.
 */
export function calculateLine(
  line: LineItem,
  measurements: ReadonlyMap<string, Measurement>,
): LineResult {
  const issues: Issue[] = [];
  const refs = { lineId: line.id };

  for (const q of line.queries) {
    if (q.status === "open") issues.push(issue("OPEN_QUERY", `"${line.name}": ${q.text}`, { ...refs, queryId: q.id }));
  }
  if (line.rateSource.verification === "provisional" && line.rate !== null) {
    issues.push(issue("PROVISIONAL_RATE", `"${line.name}" uses a provisional rate that has not been verified.`, refs));
  }
  if (line.supplyBasis === "client_supplied" && line.rate !== null && !dec(line.rate).isZero()) {
    issues.push(issue("CLIENT_SUPPLIED_HAS_COST", `"${line.name}" is marked client-supplied but carries a cost.`, refs));
  }

  if (line.method === "lump_sum") {
    if (line.rateUnit !== "lump_sum") {
      issues.push(issue("INVALID_LINE", `"${line.name}" is a lump sum, so its rate unit must be "job / lump sum".`, refs));
      return { lineId: line.id, quantity: "1", quantityUnit: "lump_sum", amount: null, formula: "Lump sum (invalid unit)", issues };
    }
    if (line.rate === null) {
      issues.push(issue("PRICE_NOT_CONFIGURED", `"${line.name}" has no lump-sum amount.`, refs));
      return { lineId: line.id, quantity: "1", quantityUnit: "lump_sum", amount: null, formula: "Lump sum: price not configured", issues };
    }
    const amount = round2(dec(line.rate));
    return { lineId: line.id, quantity: "1", quantityUnit: "lump_sum", amount: amount.toFixed(2), formula: `Lump sum ${fmt(amount)}`, issues };
  }

  // quantity_x_rate
  const { quantity, unit } = effectiveQuantity(line, measurements, issues);
  const unitLabel = UNIT_LABELS[unit].short;

  if (unit === "lump_sum" || line.rateUnit === "lump_sum") {
    issues.push(issue("INVALID_LINE", `"${line.name}": a lump sum cannot be multiplied by a quantity. Use the lump-sum method.`, refs));
    return { lineId: line.id, quantity, quantityUnit: unit, amount: null, formula: "Invalid: lump sum × quantity", issues };
  }
  if (quantity === null) {
    issues.push(issue("QUANTITY_MISSING", `"${line.name}" has no quantity.`, refs));
  }
  if (line.rate === null) {
    issues.push(issue("PRICE_NOT_CONFIGURED", `"${line.name}" has no unit rate. Assign a catalogue price or enter an authorised provisional rate.`, refs));
  }
  if (unit !== line.rateUnit) {
    issues.push(
      issue(
        "UNIT_MISMATCH",
        `"${line.name}": quantity is in ${UNIT_LABELS[unit].long.toLowerCase()} but the rate is per ${UNIT_LABELS[line.rateUnit].long.toLowerCase()}.`,
        refs,
      ),
    );
    return { lineId: line.id, quantity, quantityUnit: unit, amount: null, formula: `Unit mismatch (${unitLabel} vs per ${UNIT_LABELS[line.rateUnit].short})`, issues };
  }
  if (unit === "unit_tbc") {
    issues.push(issue("UNIT_TBC", `"${line.name}": the unit of measure has not been confirmed.`, refs));
  }
  if (quantity === null || line.rate === null) {
    return { lineId: line.id, quantity, quantityUnit: unit, amount: null, formula: "Cannot calculate", issues };
  }

  const q = dec(quantity);
  const r = dec(line.rate);
  const amount = round2(q.times(r));
  return {
    lineId: line.id,
    quantity,
    quantityUnit: unit,
    amount: moneyString(amount),
    formula: `${q.toString()} ${unitLabel} × ${fmt(r)} = ${fmt(amount)}`,
    issues,
  };
}
