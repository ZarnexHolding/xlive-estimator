/** Units of measure supported by line items, measurements and catalogue rates. */
export const UNITS = [
  "each",
  "lm",
  "m2",
  "m3",
  "sheet",
  "kg",
  "day",
  "hour",
  "lump_sum",
  "unit_tbc",
] as const;

export type Unit = (typeof UNITS)[number];

export const UNIT_LABELS: Record<Unit, { short: string; long: string }> = {
  each: { short: "ea", long: "Each / piece" },
  lm: { short: "lm", long: "Linear metre" },
  m2: { short: "m²", long: "Square metre" },
  m3: { short: "m³", long: "Cubic metre" },
  sheet: { short: "sheet", long: "Sheet" },
  kg: { short: "kg", long: "Kilogram" },
  day: { short: "day", long: "Day" },
  hour: { short: "hr", long: "Hour" },
  lump_sum: { short: "job", long: "Job / lump sum" },
  unit_tbc: { short: "unit TBC", long: "Unit to be confirmed" },
};

/** Unit implied by multiplying N metre dimensions together (0 dimensions = a count). */
export function unitForDimensionCount(count: number): Unit {
  switch (count) {
    case 0:
      return "each";
    case 1:
      return "lm";
    case 2:
      return "m2";
    case 3:
      return "m3";
    default:
      throw new Error(`Cannot derive a unit from ${count} dimensions`);
  }
}
