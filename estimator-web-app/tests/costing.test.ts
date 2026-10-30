import { describe, expect, it } from "vitest";
import { addRateVersion, applyCatalogueRate, type CatalogueItem } from "@/domain/catalogue";
import { calculateEstimate } from "@/domain/costing/engine";
import type { IssueCode } from "@/domain/costing/types";
import { emptyCosting, makeLine, makeMeasurement, newEstimate, resolveQuery } from "@/domain/factories";
import { editMeasurement, setReviewStatus } from "@/domain/measurements";
import { emdadSampleEstimate } from "@/domain/reference-data/emdad";
import { idcubeSampleEstimate } from "@/domain/reference-data/idcube";
import { CostingInputSchema, type CostingInput, type LineItem } from "@/domain/schemas";
import { ApprovalError, approveEstimate, verifyVersion } from "@/domain/versioning";

const AT = "2026-10-29T10:00:00.000Z";

function costing(lines: LineItem[], overrides: Partial<CostingInput> = {}): CostingInput {
  return {
    ...emptyCosting("SAR"),
    lineItems: lines,
    overhead: { mode: "none", value: null, note: "" },
    contingency: { mode: "none", value: null, note: "" },
    pricing: { mode: "markup", markupRate: "0.30", marginRate: "0.30", fixedPrice: null, fixedPriceReason: "" },
    ...overrides,
  };
}

const qtyLine = (id: string, quantity: string | null, unit: LineItem["quantityUnit"], rate: string | null, rateUnit: LineItem["rateUnit"] = unit) =>
  makeLine({ id, name: id, quantity, quantityUnit: unit, rate, rateUnit, costType: "material" });

const codes = (calc: ReturnType<typeof calculateEstimate>, lineId?: string): IssueCode[] =>
  calc.issues.filter((i) => lineId === undefined || i.lineId === lineId).map((i) => i.code);

describe("A–C: EMDAD line items", () => {
  it("A: floor 70 m² × SAR 165/m² = SAR 11,550", () => {
    const calc = calculateEstimate(costing([qtyLine("floor", "70", "m2", "165")]));
    expect(calc.lines[0].amount).toBe("11550.00");
    expect(calc.directCost).toBe("11550.00");
  });

  it("B: wall 56 m² × SAR 150/m² = SAR 8,400", () => {
    expect(calculateEstimate(costing([qtyLine("wall", "56", "m2", "150")])).lines[0].amount).toBe("8400.00");
  });

  it("C: LED wall 45 m² × SAR 350/m² = SAR 15,750", () => {
    expect(calculateEstimate(costing([qtyLine("led", "45", "m2", "350")])).lines[0].amount).toBe("15750.00");
  });
});

describe("D: full EMDAD reference calculation", () => {
  const sample = emdadSampleEstimate();
  const calc = calculateEstimate(sample.costing);

  it("sums the 11 listed lines to SAR 65,550", () => {
    expect(sample.costing.lineItems).toHaveLength(11);
    expect(calc.lines.every((l) => l.amount !== null)).toBe(true);
    expect(calc.directCost).toBe("65550.00");
  });

  it("applies a 30 % markup: SAR 19,665 markup, SAR 85,215 before VAT", () => {
    expect(calc.pricing.mode).toBe("markup");
    expect(calc.pricing.profit).toBe("19665.00");
    expect(calc.sellingPriceExVat).toBe("85215.00");
  });

  it("derives the totals from the lines (not hardcoded): totals move when inputs move", () => {
    const changed = structuredClone(sample.costing);
    changed.measurements = changed.measurements.map((m) =>
      m.id === "emdad-m-floor" ? editMeasurement(m, { dimensions: { ...m.dimensions, length: "15" } }, "test", AT) : m,
    );
    const recalculated = calculateEstimate(changed);
    expect(recalculated.directCost).toBe("66375.00"); // + 5 m² × 165
    changed.pricing.markupRate = "0.25";
    expect(calculateEstimate(changed).sellingPriceExVat).toBe("82968.75");
  });

  it("does not present the reference as ready: ambiguities block quotation", () => {
    expect(calc.readyForQuotation).toBe(false);
    expect(codes(calc, "emdad-l-header")).toContain("UNIT_TBC");
    expect(codes(calc, "emdad-l-branding")).toContain("UNIT_TBC");
    expect(codes(calc, "emdad-l-glass")).toContain("UNIT_TBC");
    expect(codes(calc, "emdad-l-led")).toContain("OPEN_QUERY");
    expect(codes(calc, "emdad-l-hidden")).toContain("OPEN_QUERY");
    expect(codes(calc, "emdad-l-floor")).toContain("MEASUREMENT_NOT_APPROVED");
    // The "Hidden" label is preserved verbatim.
    expect(sample.costing.lineItems.find((l) => l.id === "emdad-l-hidden")?.name).toBe("Hidden");
  });

  it("derives the 70 m² floor and 56 m² gross elevation from the dimensioned drawings", () => {
    const m = new Map(sample.costing.measurements.map((x) => [x.id, x]));
    expect(m.get("emdad-m-floor")).toMatchObject({ quantity: "70", unit: "m2", sourcePage: 14 });
    expect(m.get("emdad-m-front-elev")).toMatchObject({ quantity: "56", unit: "m2", sourcePage: 15 });
  });
});

describe("E: IDCUBE reconciliation", () => {
  const sample = idcubeSampleEstimate();
  const calc = calculateEstimate(sample.costing);

  it("sums the listed amounts to SAR 11,750 and flags the SAR 3,250 difference to SAR 15,000", () => {
    expect(calc.directCost).toBe("11750.00");
    expect(calc.reconciliations).toEqual([
      expect.objectContaining({ reportedTotal: "15000.00", calculatedTotal: "11750.00", difference: "3250.00", status: "unresolved" }),
    ]);
    expect(codes(calc)).toContain("RECONCILIATION_UNRESOLVED");
    expect(calc.readyForQuotation).toBe(false);
  });

  it("never manipulates the line items to force a match", () => {
    const amounts = calc.lines.map((l) => l.amount);
    expect(amounts).toEqual(["3000.00", "950.00", "700.00", "800.00", "1200.00", "800.00", "800.00", "1000.00", "1000.00", "500.00", "500.00", "500.00"]);
  });

  it("an explanation changes the status to explained, but the difference stays visible", () => {
    const explained = structuredClone(sample.costing);
    explained.reconciliations[0].explanation = "Difference relates to carpet and transport invoiced separately.";
    const r = calculateEstimate(explained).reconciliations[0];
    expect(r.status).toBe("explained");
    expect(r.difference).toBe("3250.00");
  });
});

describe("F: markup versus margin", () => {
  const lines = [qtyLine("cost", "1", "each", "65550")];

  it("produces different prices for a 30 % markup and a 30 % gross margin", () => {
    const markup = calculateEstimate(costing(lines));
    const margin = calculateEstimate(costing(lines, { pricing: { mode: "margin", markupRate: "0.30", marginRate: "0.30", fixedPrice: null, fixedPriceReason: "" } }));
    expect(markup.sellingPriceExVat).toBe("85215.00");
    expect(margin.sellingPriceExVat).toBe("93642.86");
    expect(margin.pricing.effectiveMargin).toBe("0.3");
    expect(markup.pricing.effectiveMargin).not.toBe("0.3");
  });

  it("rejects a 100 % margin instead of dividing by zero", () => {
    const calc = calculateEstimate(costing(lines, { pricing: { mode: "margin", markupRate: "0", marginRate: "1", fixedPrice: null, fixedPriceReason: "" } }));
    expect(calc.sellingPriceExVat).toBeNull();
    expect(codes(calc)).toContain("INVALID_PRICING");
  });

  it("rejects negative percentages at the schema boundary", () => {
    const bad = costing(lines, { pricing: { mode: "markup", markupRate: "-0.1", marginRate: "0", fixedPrice: null, fixedPriceReason: "" } });
    expect(CostingInputSchema.safeParse(bad).success).toBe(false);
  });

  it("requires a reason for a fixed selling price and reports the effective markup", () => {
    const noReason = calculateEstimate(costing(lines, { pricing: { mode: "fixed_price", markupRate: "0", marginRate: "0", fixedPrice: "90000", fixedPriceReason: "" } }));
    expect(codes(noReason)).toContain("INVALID_PRICING");
    const fixed = calculateEstimate(costing(lines, { pricing: { mode: "fixed_price", markupRate: "0", marginRate: "0", fixedPrice: "90000", fixedPriceReason: "Agreed with client" } }));
    expect(fixed.sellingPriceExVat).toBe("90000.00");
    expect(fixed.pricing.profit).toBe("24450.00");
  });
});

describe("G: missing prices", () => {
  it("flags a missing rate instead of treating it as a confirmed zero", () => {
    const calc = calculateEstimate(costing([qtyLine("priced", "10", "m2", "100"), qtyLine("unpriced", "10", "m2", null)]));
    const unpriced = calc.lines.find((l) => l.lineId === "unpriced")!;
    expect(unpriced.amount).toBeNull();
    expect(codes(calc, "unpriced")).toContain("PRICE_NOT_CONFIGURED");
    expect(calc.directCost).toBe("1000.00");
    expect(calc.uncalculatedLineCount).toBe(1);
    expect(calc.readyForQuotation).toBe(false);
  });

  it("flags a lump sum without an amount", () => {
    const calc = calculateEstimate(costing([makeLine({ id: "install", name: "Installation", method: "lump_sum", quantityUnit: "lump_sum", rateUnit: "lump_sum", rate: null })]));
    expect(calc.lines[0].amount).toBeNull();
    expect(codes(calc)).toContain("PRICE_NOT_CONFIGURED");
  });

  it("an empty estimate is not ready", () => {
    expect(codes(calculateEstimate(costing([])))).toContain("NO_LINES");
  });
});

describe("H: unit validation", () => {
  it("refuses to multiply a square-metre quantity by a per-piece rate", () => {
    const calc = calculateEstimate(costing([qtyLine("x", "56", "m2", "1500", "each")]));
    expect(calc.lines[0].amount).toBeNull();
    expect(codes(calc)).toContain("UNIT_MISMATCH");
    expect(calc.directCost).toBe("0.00");
  });

  it("catches a mismatch introduced by applying a catalogue rate", () => {
    const counter: CatalogueItem = {
      id: "cat-counter", name: "Counter", category: "Furniture", unit: "each", costType: "material", supplier: "", notes: "", active: true,
      specs: { thicknessMm: null, sheetLengthMm: null, sheetWidthMm: null },
      rates: [{ id: "r1", rate: "1500", currency: "SAR", verification: "verified", source: "test", effectiveFrom: "2026-01-01", recordedAt: AT }],
      updatedAt: AT,
    };
    const line = applyCatalogueRate(qtyLine("wall", "56", "m2", null, "m2"), counter, "2026-10-29");
    expect(codes(calculateEstimate(costing([line])))).toContain("UNIT_MISMATCH");
  });

  it("does not multiply a lump sum by a quantity", () => {
    const calc = calculateEstimate(costing([qtyLine("x", "3", "each", "3000", "lump_sum")]));
    expect(calc.lines[0].amount).toBeNull();
    expect(codes(calc)).toContain("INVALID_LINE");
    const lump = calculateEstimate(costing([makeLine({ id: "e", name: "Electrical", method: "lump_sum", quantity: "7", quantityUnit: "lump_sum", rate: "3000", rateUnit: "lump_sum" })]));
    expect(lump.lines[0].amount).toBe("3000.00");
  });
});

describe("I: historical estimates", () => {
  const catalogue: CatalogueItem = {
    id: "cat-floor", name: "Booth floor", category: "Flooring", unit: "m2", costType: "material", supplier: "", notes: "", active: true,
    specs: { thicknessMm: null, sheetLengthMm: null, sheetWidthMm: null },
    rates: [{ id: "floor-r1", rate: "165", currency: "SAR", verification: "verified", source: "Supplier quote", effectiveFrom: "2026-10-01", recordedAt: AT }],
    updatedAt: AT,
  };

  function readyEstimate() {
    const estimate = newEstimate({ id: "e1", project: { projectName: "Test", clientName: "Client", projectType: "exhibition_booth", venue: "", eventDates: "", estimator: "", notes: "" }, at: AT });
    const line = applyCatalogueRate(qtyLine("floor", "70", "m2", null), catalogue, "2026-10-29");
    estimate.costing = costing([line]);
    return estimate;
  }

  it("changing the catalogue price does not modify an approved version", () => {
    const approved = approveEstimate(readyEstimate(), { versionId: "v1", approvedBy: "Estimator", note: "", acknowledgeWarnings: false, at: AT });
    const v1 = approved.versions[0];
    expect(v1.calculation.directCost).toBe("11550.00");
    expect(v1.calculation.sellingPriceExVat).toBe("15015.00");

    const updatedCatalogue = addRateVersion(catalogue, { id: "floor-r2", rate: "180", currency: "SAR", verification: "verified", source: "New supplier quote", effectiveFrom: "2026-11-01", recordedAt: "2026-11-01T08:00:00.000Z" });
    expect(updatedCatalogue.rates).toHaveLength(2);
    expect(updatedCatalogue.rates[0].rate).toBe("165"); // history kept

    // The approved snapshot still reproduces its stored totals.
    expect(verifyVersion(v1)).toEqual({ ok: true, recalculatedPrice: "15015.00" });
    // A new draft line priced from the new catalogue rate differs; the version does not.
    const repriced = applyCatalogueRate(approved.costing.lineItems[0], updatedCatalogue, "2026-11-02");
    expect(calculateEstimate(costing([repriced])).directCost).toBe("12600.00");
    expect(approved.versions[0].calculation.directCost).toBe("11550.00");
  });

  it("the snapshot is a copy: mutating the working draft cannot reach it", () => {
    const approved = approveEstimate(readyEstimate(), { versionId: "v1", approvedBy: "Estimator", note: "", acknowledgeWarnings: false, at: AT });
    approved.costing.lineItems[0].rate = "999";
    expect(approved.versions[0].costing.lineItems[0].rate).toBe("165");
    expect(verifyVersion(approved.versions[0]).ok).toBe(true);
  });

  it("refuses approval while blocking issues exist, and requires warnings to be acknowledged", () => {
    expect(() => approveEstimate(emdadSampleEstimate(), { versionId: "v1", approvedBy: "E", note: "", acknowledgeWarnings: true, at: AT })).toThrow(ApprovalError);
    const withWarning = readyEstimate();
    withWarning.costing.overhead = { mode: "not_set", value: null, note: "" };
    expect(() => approveEstimate(withWarning, { versionId: "v1", approvedBy: "E", note: "", acknowledgeWarnings: false, at: AT })).toThrow(/acknowledged/);
    expect(approveEstimate(withWarning, { versionId: "v1", approvedBy: "E", note: "", acknowledgeWarnings: true, at: AT }).versions[0].acknowledgedWarnings).toHaveLength(1);
  });
});

describe("Supporting rules", () => {
  it("rounds half-up with decimal arithmetic (no float drift)", () => {
    // 3 × 0.835 = 2.505 exactly; binary floats give 2.5049999… and would round down.
    expect(calculateEstimate(costing([qtyLine("x", "3", "each", "0.835")])).lines[0].amount).toBe("2.51");
    expect(calculateEstimate(costing([qtyLine("y", "0.1", "m2", "0.2")])).lines[0].amount).toBe("0.02");
  });

  it("applies overhead, then contingency, then pricing, each as a separate figure", () => {
    const calc = calculateEstimate(
      costing([qtyLine("x", "1", "each", "1000")], {
        overhead: { mode: "percent", value: "0.10", note: "" },
        contingency: { mode: "percent", value: "0.05", note: "" },
        pricing: { mode: "margin", markupRate: "0", marginRate: "0.20", fixedPrice: null, fixedPriceReason: "" },
      }),
    );
    expect(calc.overhead.amount).toBe("100.00");
    expect(calc.contingency.amount).toBe("55.00");
    expect(calc.costBase).toBe("1155.00");
    expect(calc.sellingPriceExVat).toBe("1443.75");
  });

  it("warns when overhead and contingency have not been decided", () => {
    const calc = calculateEstimate(costing([qtyLine("x", "1", "each", "10")], { overhead: { mode: "not_set", value: null, note: "" } }));
    expect(codes(calc)).toContain("ALLOWANCE_NOT_SET");
    expect(calc.readyForQuotation).toBe(true); // a warning, not a block
  });

  it("uses the linked measurement's quantity and requires it to be approved", () => {
    const m = makeMeasurement({ id: "m1", componentName: "OLED side panels", dimensions: { length: "9", width: null, height: "0.75", depth: null }, derivation: { dims: ["length", "height"], multiplier: "2" } });
    expect(m.quantity).toBe("13.5");
    expect(m.unit).toBe("m2");
    const line = makeLine({ id: "oled", name: "OLED", quantityUnit: "m2", rate: "100", rateUnit: "m2", quantitySource: { kind: "measurement", measurementId: "m1", note: "" } });
    const pending = calculateEstimate(costing([line], { measurements: [m] }));
    expect(pending.lines[0].amount).toBe("1350.00");
    expect(codes(pending)).toContain("MEASUREMENT_NOT_APPROVED");
    const approved = setReviewStatus(m, "approved", "Checked against p21", AT);
    expect(calculateEstimate(costing([line], { measurements: [approved] })).readyForQuotation).toBe(true);
    // Editing an approved measurement sends it back for review.
    const edited = editMeasurement(approved, { dimensions: { ...approved.dimensions, length: "10" } }, "Revised drawing", AT);
    expect(edited.quantity).toBe("15");
    expect(edited.reviewStatus).toBe("unreviewed");
    expect(edited.reviewHistory.at(-1)?.action).toBe("edited");
  });

  it("blocks a client-supplied item that carries a cost", () => {
    const line = { ...qtyLine("tv", "2", "each", "250"), supplyBasis: "client_supplied" as const };
    expect(codes(calculateEstimate(costing([line])))).toContain("CLIENT_SUPPLIED_HAS_COST");
  });

  it("resolving a query requires a note", () => {
    const sample = emdadSampleEstimate();
    const q = sample.costing.lineItems.find((l) => l.id === "emdad-l-hidden")!.queries[0];
    expect(() => resolveQuery(q, " ", AT)).toThrow();
    expect(resolveQuery(q, "Hidden = concealed structural reinforcement", AT).status).toBe("resolved");
  });
});
