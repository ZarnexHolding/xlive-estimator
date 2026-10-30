import Decimal from "decimal.js";

/**
 * All money and quantity arithmetic goes through this module. Values cross layer
 * boundaries as decimal strings ("11550.00"), never as JS floats.
 */
export const D = Decimal.clone({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  // Never switch to exponential notation: strings must stay plain decimals.
  toExpNeg: -30,
  toExpPos: 40,
});
export type Dec = InstanceType<typeof D>;

/** A plain decimal number written as a string, e.g. "70", "0.30", "-12.5". */
export type DecimalString = string;

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export function isDecimalString(value: unknown): value is DecimalString {
  return typeof value === "string" && DECIMAL_PATTERN.test(value);
}

export function dec(value: DecimalString | number | Dec): Dec {
  if (typeof value === "string" && !DECIMAL_PATTERN.test(value)) {
    throw new Error(`Not a decimal value: "${value}"`);
  }
  return new D(value);
}

/** Round half-up to 2 decimal places (the money rounding policy). */
export function round2(value: Dec): Dec {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function moneyString(value: Dec): DecimalString {
  return round2(value).toFixed(2);
}

export function sum(values: Dec[]): Dec {
  return values.reduce((acc, v) => acc.plus(v), new D(0));
}

/** Normalise user input such as "1,500.50" or " 70 " into a decimal string, or null. */
export function parseDecimalInput(raw: string): DecimalString | null {
  const cleaned = raw.replace(/[,\s]/g, "");
  if (cleaned === "") return null;
  if (!DECIMAL_PATTERN.test(cleaned)) return null;
  return new D(cleaned).toString();
}
