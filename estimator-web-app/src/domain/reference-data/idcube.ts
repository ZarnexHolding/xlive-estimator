import type { Estimate } from "../estimate";
import { makeLine, makeMeasurement, makeQuery } from "../factories";
import type { CostType, LineItem, Measurement, SupplyBasis } from "../schemas";
import { REFERENCE_AT as AT } from "./documents";

const DOC = "ref-idcube";
const ref = { origin: "reference_analysis", sourceDocumentId: DOC } as const;
const dims = (d: Partial<Measurement["dimensions"]>) => ({ length: null, width: null, height: null, depth: null, ...d });

/** Developer-prepared extraction of the IDCUBE drawings. Not AI output. */
export function idcubeMeasurements(): Measurement[] {
  return [
    makeMeasurement({
      ...ref, id: "idcube-m-floor", componentName: "Booth floor (grey carpet)", category: "Flooring",
      dimensions: dims({ length: "6", width: "6" }), derivation: { dims: ["length", "width"], multiplier: "1" },
      sourcePage: 9, sourceLabels: ["6m", "6m", "Grey carpet flooring (p10)"], basis: "derived", confidence: "high",
      notes: "Top view: 6 × 6 grid cells of 1 m confirm the labels.",
    }),
    makeMeasurement({
      ...ref, id: "idcube-m-backwall", componentName: "Back wall (gross, one face)", category: "Walls",
      dimensions: dims({ width: "6", height: "3.5" }), derivation: { dims: ["width", "height"], multiplier: "1" },
      sourcePage: 8, sourceLabels: ["6m", "3.5m"], basis: "derived", confidence: "high",
      notes: "Single back wall; booth is open on three sides. Wall thickness and rear face not specified.",
    }),
    makeMeasurement({
      ...ref, id: "idcube-m-tv", componentName: "75\" LED TV", category: "LED & AV",
      derivation: { dims: [], multiplier: "2" }, sourcePage: 10, sourceLabels: ["75\" LED TV ×2"],
      basis: "explicit_label", confidence: "high", notes: "Grid width ≈ 1.65 m each, consistent with 75\".",
    }),
    makeMeasurement({
      ...ref, id: "idcube-m-demo", componentName: "Demo station", category: "Furniture & joinery",
      derivation: { dims: [], multiplier: "2" }, sourcePage: 10, sourceLabels: ["Demo station ×2"],
      basis: "explicit_label", confidence: "high", notes: "Approx. 1.55 × 0.65 m each from the plan grid (p9).",
    }),
    makeMeasurement({
      ...ref, id: "idcube-m-cabinet", componentName: "Storage cabinet run", category: "Furniture & joinery",
      derivation: { dims: [], multiplier: "2" }, sourcePage: 10, sourceLabels: ["Storage cabinet ×2"],
      basis: "explicit_label", confidence: "high", notes: "Approx. 1.9 m long each from the plan grid (p9).",
    }),
    makeMeasurement({
      ...ref, id: "idcube-m-logos", componentName: "IDCUBE 3D acrylic cutout logo", category: "Branding & graphics",
      derivation: { dims: [], multiplier: "2" }, sourcePage: 10, sourceLabels: ["3D acrylic cutout logo"],
      basis: "explicit_label", confidence: "medium",
    }),
    makeMeasurement({
      ...ref, id: "idcube-m-pushthrough", componentName: "Acrylic push-through lettering (Access360 Core)", category: "Branding & graphics",
      derivation: { dims: [], multiplier: "1" }, sourcePage: 10, sourceLabels: ["Arcylic push through logo"],
      basis: "explicit_label", confidence: "medium",
    }),
    makeMeasurement({
      ...ref, id: "idcube-m-panel", componentName: "Central white graphic panel", category: "Branding & graphics",
      dimensions: dims({ width: "1.6", height: "2.4" }), derivation: { dims: ["width", "height"], multiplier: "1" },
      sourcePage: 8, basis: "grid_scale", confidence: "medium",
    }),
    makeMeasurement({
      ...ref, id: "idcube-m-chairs", componentName: "Chairs", category: "Furniture (loose)",
      derivation: { dims: [], multiplier: "5" }, sourcePage: 9, basis: "visual_estimate", confidence: "medium",
      notes: "5 chairs in the top view; 4 visible in the front elevation (p8).",
    }),
    makeMeasurement({
      ...ref, id: "idcube-m-platform", componentName: "Platform height", category: "Flooring",
      unit: "lm", basis: "unresolved", confidence: "low", notes: "LED-edged raised floor visible; height not stated.",
    }),
  ];
}

const SRC = "IDCUBE cost list provided by XLive";
function refLump(id: string, name: string, amount: string, costType: CostType, category: string, extra: Partial<LineItem> = {}, supplyBasis: SupplyBasis = "produce"): LineItem {
  return makeLine({
    id, name, category, costType, supplyBasis, method: "lump_sum", quantityUnit: "lump_sum", rate: amount, rateUnit: "lump_sum",
    quantitySource: { kind: "reference", measurementId: null, note: "Reference amount; no quantity given" },
    rateSource: { kind: "reference", catalogueItemId: null, catalogueRateId: null, verification: "provisional", note: SRC },
    ...extra,
  });
}

export function idcubeLineItems(): LineItem[] {
  return [
    refLump("idcube-l-mdf18", "18 mm MDF", "3000", "material", "Carpentry materials"),
    refLump("idcube-l-mdf8", "8 mm MDF", "950", "material", "Carpentry materials"),
    refLump("idcube-l-melanin", "Melanin", "700", "material", "Finishes", { notes: "Original label preserved; probably melamine laminate." }),
    refLump("idcube-l-paint", "Paint", "800", "material", "Finishes"),
    refLump("idcube-l-carpenter", "Carpenter", "1200", "labour", "Carpentry"),
    refLump("idcube-l-painter", "Painter", "800", "labour", "Finishes"),
    refLump("idcube-l-electrical", "Electrical", "800", "subcontract", "Electrical"),
    refLump("idcube-l-removing", "Removing", "1000", "labour", "Installation", { customerDescription: "Dismantling and removal" }),
    refLump("idcube-l-installation", "Installation", "1000", "labour", "Installation"),
    refLump("idcube-l-tv", "TV rental", "500", "equipment_rental", "LED & AV", {
      queries: [makeQuery("idcube-q-tv", "Does the SAR 500 TV rental cover both 75\" TVs, and for how many days?", AT)],
    }, "rent"),
    refLump("idcube-l-logo", "Logo", "500", "material", "Branding & graphics"),
    refLump("idcube-l-furniture", "Chair and table", "500", "other", "Furniture (loose)", {
      notes: "Rental or purchase not stated.",
    }),
  ];
}

export function idcubeSampleEstimate(): Estimate {
  return {
    id: "sample-idcube",
    project: {
      projectName: "IDCUBE exhibition booth 6 m × 6 m",
      clientName: "IDCUBE",
      projectType: "exhibition_booth",
      venue: "",
      eventDates: "",
      estimator: "",
      notes: "Demo sample built from the IDCUBE cost list. Markup set to 30 % to match the EMDAD reference; confirm before quoting.",
    },
    status: "draft",
    documents: [],
    analysisRuns: [],
    costing: {
      currency: "SAR",
      measurements: idcubeMeasurements(),
      lineItems: idcubeLineItems(),
      pricing: { mode: "markup", markupRate: "0.30", marginRate: "0.30", fixedPrice: null, fixedPriceReason: "" },
      overhead: { mode: "none", value: null, note: "The reference cost list has no overhead allowance." },
      contingency: { mode: "none", value: null, note: "The reference cost list has no contingency allowance." },
      reconciliations: [
        {
          id: "idcube-r-total",
          label: "Separately reported IDCUBE total",
          reportedTotal: "15000",
          source: "Total reported separately from the itemised list",
          explanation: null,
        },
      ],
      queries: [],
    },
    versions: [],
    quotations: [],
    sample: "idcube",
    createdAt: AT,
    updatedAt: AT,
  };
}
