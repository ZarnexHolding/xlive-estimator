import { D, dec, moneyString, sum, type Dec } from "../money";
import { quantityDiffersFromDimensions } from "../measurements";
import { COST_TYPES, type CostType, type CostingInput, type Measurement } from "../schemas";
import { issue } from "./issues";
import { calculateLine } from "./line";
import { calculateAllowance, calculatePricing } from "./pricing";
import { ENGINE_VERSION, type EstimateCalculation, type Issue, type ReconciliationResult } from "./types";

/**
 * The costing engine. Given the same input it always returns the same result.
 * Totals are sums of rounded line amounts, so displayed lines always reconcile
 * with displayed totals.
 */
export function calculateEstimate(input: CostingInput): EstimateCalculation {
  const measurements = new Map<string, Measurement>(input.measurements.map((m) => [m.id, m]));
  const issues: Issue[] = [];

  for (const q of input.queries) {
    if (q.status === "open") issues.push(issue("OPEN_QUERY", q.text, { queryId: q.id }));
  }
  // Open queries on measurements that feed a cost line block approval too.
  const linkedMeasurementIds = new Set(
    input.lineItems
      .filter((l) => l.included && l.quantitySource.kind === "measurement" && l.quantitySource.measurementId)
      .map((l) => l.quantitySource.measurementId as string),
  );
  for (const m of input.measurements) {
    if (!linkedMeasurementIds.has(m.id)) continue;
    for (const q of m.queries) {
      if (q.status === "open") issues.push(issue("OPEN_QUERY", `"${m.componentName}": ${q.text}`, { measurementId: m.id, queryId: q.id }));
    }
    if (quantityDiffersFromDimensions(m)) {
      issues.push(issue("MEASUREMENT_QUANTITY_DIFFERS", `"${m.componentName}": the stated quantity does not match its dimensions.`, { measurementId: m.id }));
    }
  }

  const lines = input.lineItems.map((line) => calculateLine(line, measurements));
  const byCostTypeDec = Object.fromEntries(COST_TYPES.map((t) => [t, new D(0)])) as Record<CostType, Dec>;
  const byCategoryDec = new Map<string, Dec>();
  const included: Dec[] = [];
  let uncalculatedLineCount = 0;

  input.lineItems.forEach((line, i) => {
    const result = lines[i];
    if (!line.included) {
      issues.push(issue("LINE_EXCLUDED", `"${line.name}" is excluded from the total.`, { lineId: line.id }));
      return;
    }
    issues.push(...result.issues);
    if (line.quantitySource.kind === "reference" && line.method === "lump_sum" && line.costType === "material") {
      // A material priced as a reference lump sum (e.g. "18 mm MDF: SAR 3,000") has no quantity or unit rate behind it.
      issues.push(issue("QUANTITY_BASIS_UNKNOWN", `"${line.name}" is a material amount without a quantity or unit rate.`, { lineId: line.id }));
    }
    if (result.amount === null) {
      uncalculatedLineCount += 1;
      return;
    }
    const amount = dec(result.amount);
    included.push(amount);
    byCostTypeDec[line.costType] = byCostTypeDec[line.costType].plus(amount);
    const category = line.category || "Uncategorised";
    byCategoryDec.set(category, (byCategoryDec.get(category) ?? new D(0)).plus(amount));
  });

  if (input.lineItems.filter((l) => l.included).length === 0) {
    issues.push(issue("NO_LINES", "The estimate has no included cost lines."));
  }

  const directCost = sum(included);
  const overhead = calculateAllowance("Overhead", input.overhead, directCost, issues);
  const contingencyBase = directCost.plus(overhead);
  const contingency = calculateAllowance("Contingency", input.contingency, contingencyBase, issues);
  const costBase = contingencyBase.plus(contingency);
  const pricing = calculatePricing(costBase, input.pricing, issues);

  const reconciliations: ReconciliationResult[] = input.reconciliations.map((r) => {
    const difference = dec(r.reportedTotal).minus(directCost);
    const status = difference.isZero() ? "reconciled" : r.explanation?.trim() ? "explained" : "unresolved";
    if (status === "unresolved") {
      issues.push(
        issue(
          "RECONCILIATION_UNRESOLVED",
          `${r.label}: reported ${moneyString(dec(r.reportedTotal))} vs calculated ${moneyString(directCost)}. Difference ${moneyString(difference)} is unexplained.`,
        ),
      );
    }
    return {
      id: r.id,
      label: r.label,
      reportedTotal: moneyString(dec(r.reportedTotal)),
      calculatedTotal: moneyString(directCost),
      difference: moneyString(difference),
      status,
    };
  });

  const blockingCount = issues.filter((i) => i.severity === "blocking").length;
  return {
    engineVersion: ENGINE_VERSION,
    currency: input.currency,
    lines,
    directCost: moneyString(directCost),
    byCostType: Object.fromEntries(COST_TYPES.map((t) => [t, moneyString(byCostTypeDec[t])])) as Record<CostType, string>,
    byCategory: [...byCategoryDec.entries()].map(([category, amount]) => ({ category, amount: moneyString(amount) })),
    overhead: { mode: input.overhead.mode, base: moneyString(directCost), amount: moneyString(overhead) },
    contingency: { mode: input.contingency.mode, base: moneyString(contingencyBase), amount: moneyString(contingency) },
    costBase: moneyString(costBase),
    pricing,
    sellingPriceExVat: pricing.sellingPrice,
    reconciliations,
    issues,
    blockingCount,
    warningCount: issues.length - blockingCount,
    uncalculatedLineCount,
    readyForQuotation: blockingCount === 0 && pricing.sellingPrice !== null,
  };
}
