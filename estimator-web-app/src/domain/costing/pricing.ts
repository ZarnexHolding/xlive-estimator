import { D, dec, moneyString, round2, type Dec } from "../money";
import type { Allowance, PricingConfig } from "../schemas";
import { issue } from "./issues";
import type { Issue, PricingResult } from "./types";

const MAX_MARKUP = new D(10); // 1000 %: anything above is almost certainly a data-entry error

/** Overhead or contingency allowance on a base amount. */
export function calculateAllowance(
  label: string,
  allowance: Allowance,
  base: Dec,
  issues: Issue[],
): Dec {
  switch (allowance.mode) {
    case "not_set":
      issues.push(issue("ALLOWANCE_NOT_SET", `${label} has not been set. Choose a percentage, a fixed amount, or "none".`));
      return new D(0);
    case "none":
      return new D(0);
    case "percent": {
      if (allowance.value === null || dec(allowance.value).greaterThan(1)) {
        issues.push(issue("INVALID_ALLOWANCE", `${label} percentage must be between 0 % and 100 %.`));
        return new D(0);
      }
      return round2(base.times(dec(allowance.value)));
    }
    case "fixed": {
      if (allowance.value === null) {
        issues.push(issue("INVALID_ALLOWANCE", `${label} fixed amount is missing.`));
        return new D(0);
      }
      return round2(dec(allowance.value));
    }
  }
}

/**
 * Pre-VAT selling price from the cost base.
 *  markup:      sell = cost × (1 + r)
 *  margin:      sell = cost ÷ (1 − r), 0 ≤ r < 1
 *  fixed_price: sell = fixed amount (reason required)
 */
export function calculatePricing(costBase: Dec, pricing: PricingConfig, issues: Issue[]): PricingResult {
  const invalid = (message: string): PricingResult => {
    issues.push(issue("INVALID_PRICING", message));
    return { mode: pricing.mode, rate: null, sellingPrice: null, profit: null, effectiveMarkup: null, effectiveMargin: null };
  };

  let sell: Dec;
  let rate: string | null = null;
  switch (pricing.mode) {
    case "markup": {
      const r = dec(pricing.markupRate);
      if (r.greaterThan(MAX_MARKUP)) return invalid("Markup must be between 0 % and 1000 %.");
      sell = round2(costBase.times(r.plus(1)));
      rate = r.toString();
      break;
    }
    case "margin": {
      const r = dec(pricing.marginRate);
      if (r.greaterThanOrEqualTo(1)) return invalid("Target margin must be below 100 % (a 100 % margin has no finite price).");
      sell = round2(costBase.dividedBy(new D(1).minus(r)));
      rate = r.toString();
      break;
    }
    case "fixed_price": {
      if (pricing.fixedPrice === null) return invalid("Fixed selling price is missing.");
      if (pricing.fixedPriceReason.trim() === "") return invalid("A fixed selling price needs a recorded reason.");
      sell = round2(dec(pricing.fixedPrice));
      break;
    }
  }

  const profit = sell.minus(costBase);
  return {
    mode: pricing.mode,
    rate,
    sellingPrice: moneyString(sell),
    profit: moneyString(profit),
    effectiveMarkup: costBase.isZero() ? null : profit.dividedBy(costBase).toDecimalPlaces(6).toString(),
    effectiveMargin: sell.isZero() ? null : profit.dividedBy(sell).toDecimalPlaces(6).toString(),
  };
}
