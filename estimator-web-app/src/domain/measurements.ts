import { D, dec, type DecimalString } from "./money";
import type { Derivation, Dimensions, Measurement, ReviewEvent } from "./schemas";
import { unitForDimensionCount, UNIT_LABELS, type Unit } from "./units";

/**
 * Deterministically recompute a measurement's quantity from its dimensions.
 * Returns null when the derivation is absent or a required dimension is missing.
 * AI-proposed quantities are always checked against this.
 */
export function deriveQuantity(
  dimensions: Dimensions,
  derivation: Derivation | null,
): { quantity: DecimalString; unit: Unit } | null {
  if (!derivation) return null;
  let product = dec(derivation.multiplier);
  for (const key of derivation.dims) {
    const value = dimensions[key];
    if (value === null) return null;
    product = product.times(dec(value));
  }
  // Quantities keep up to 4 dp; money rounding happens later in the costing engine.
  return {
    quantity: product.toDecimalPlaces(4).toString(),
    unit: unitForDimensionCount(derivation.dims.length),
  };
}

/** Human-readable formula, e.g. "14 × 5 = 70 m²" or "2 × 9 × 0.75 = 13.5 m²". */
export function describeDerivation(m: Pick<Measurement, "dimensions" | "derivation">): string | null {
  const derived = deriveQuantity(m.dimensions, m.derivation);
  if (!m.derivation) return null;
  const parts: string[] = [];
  if (!dec(m.derivation.multiplier).equals(1) || m.derivation.dims.length === 0) {
    parts.push(m.derivation.multiplier);
  }
  for (const key of m.derivation.dims) parts.push(m.dimensions[key] ?? `${key}?`);
  const lhs = parts.join(" × ");
  if (!derived) return `${lhs} = ?`;
  return `${lhs} = ${derived.quantity} ${UNIT_LABELS[derived.unit].short}`;
}

/** True when a stated quantity disagrees with what its dimensions produce. */
export function quantityDiffersFromDimensions(m: Measurement): boolean {
  const derived = deriveQuantity(m.dimensions, m.derivation);
  if (!derived || m.quantity === null) return false;
  return !new D(derived.quantity).equals(new D(m.quantity)) || derived.unit !== m.unit;
}

/** Apply an estimator edit; recomputes quantity when the measurement has a derivation. */
export function editMeasurement(
  m: Measurement,
  patch: Partial<Pick<Measurement, "componentName" | "category" | "dimensions" | "derivation" | "quantity" | "unit" | "sourcePage" | "notes" | "basis">>,
  reason: string,
  at: string,
): Measurement {
  const next: Measurement = { ...m, ...patch };
  const derived = deriveQuantity(next.dimensions, next.derivation);
  if (derived) {
    next.quantity = derived.quantity;
    next.unit = derived.unit;
  }
  const changes: NonNullable<ReviewEvent["changes"]> = {};
  for (const key of ["componentName", "category", "dimensions", "derivation", "quantity", "unit", "sourcePage", "notes", "basis"] as const) {
    if (JSON.stringify(m[key]) !== JSON.stringify(next[key])) changes[key] = { from: m[key], to: next[key] };
  }
  if (Object.keys(changes).length === 0) return m;
  // Any edit to an approved value sends it back for review: approval applies to a specific value.
  const reviewStatus = m.reviewStatus === "approved" ? "unreviewed" : m.reviewStatus;
  return {
    ...next,
    reviewStatus,
    reviewHistory: [...m.reviewHistory, { at, action: "edited", reason, changes }],
  };
}

export function setReviewStatus(
  m: Measurement,
  status: "approved" | "rejected" | "unreviewed",
  reason: string,
  at: string,
): Measurement {
  if (status === "approved" && m.quantity === null) {
    throw new Error("A measurement without a quantity cannot be approved. Enter a value or reject it.");
  }
  if (status === "rejected" && reason.trim() === "") {
    throw new Error("A reason is required to reject a measurement.");
  }
  const action: ReviewEvent["action"] =
    status === "approved" ? "approved" : status === "rejected" ? "rejected" : "reopened";
  return {
    ...m,
    reviewStatus: status,
    reviewHistory: [...m.reviewHistory, { at, action, reason }],
  };
}

export const BASIS_LABELS: Record<Measurement["basis"], string> = {
  explicit_label: "Confirmed from drawing",
  derived: "Derived from dimensions",
  grid_scale: "Inferred from grid/scale",
  visual_estimate: "Visually estimated",
  unresolved: "Missing / unresolved",
};
