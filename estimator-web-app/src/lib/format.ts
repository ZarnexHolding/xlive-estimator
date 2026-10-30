import { D } from "@/domain/money";
import { UNIT_LABELS, type Unit } from "@/domain/units";

/** Format a decimal string with thousands separators without converting to a float. */
export function formatAmount(value: string | null | undefined, dp = 2): string {
  if (value === null || value === undefined) return "—";
  const fixed = new D(value).toFixed(dp);
  const negative = fixed.startsWith("-");
  const [int, frac] = (negative ? fixed.slice(1) : fixed).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
}

export function formatMoney(value: string | null | undefined, currency: string): string {
  return value === null || value === undefined ? "—" : `${currency} ${formatAmount(value)}`;
}

/** "0.3" → "30 %" (fractions are stored, percentages are shown). */
export function formatPercent(fraction: string | null | undefined, dp = 2): string {
  if (fraction === null || fraction === undefined) return "—";
  const pct = new D(fraction).times(100).toDecimalPlaces(dp);
  return `${pct.toString()} %`;
}

export function percentToFraction(percent: string): string | null {
  const cleaned = percent.replace(/[%\s,]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return new D(cleaned).dividedBy(100).toString();
}

export function fractionToPercentInput(fraction: string): string {
  return new D(fraction).times(100).toDecimalPlaces(4).toString();
}

export function formatQuantity(value: string | null | undefined, unit: Unit): string {
  if (value === null || value === undefined) return "—";
  return `${formatAmount(value, new D(value).decimalPlaces())} ${UNIT_LABELS[unit].short}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
