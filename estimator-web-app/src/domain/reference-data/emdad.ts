import type { Estimate } from "../estimate";
import { makeLine, makeMeasurement, makeQuery } from "../factories";
import type { LineItem, Measurement } from "../schemas";
import { REFERENCE_AT as AT } from "./documents";

const DOC = "ref-emdad";
const ref = { origin: "reference_analysis", sourceDocumentId: DOC } as const;
const dims = (d: Partial<Measurement["dimensions"]>) => ({ length: null, width: null, height: null, depth: null, ...d });

/** Developer-prepared extraction of the EMDAD drawings (docs/reference-document-analysis.md). Not AI output. */
export function emdadMeasurements(): Measurement[] {
  return [
    makeMeasurement({
      ...ref, id: "emdad-m-floor", componentName: "Booth floor (plot area)", category: "Flooring",
      dimensions: dims({ length: "14", width: "5" }), derivation: { dims: ["length", "width"], multiplier: "1" },
      sourcePage: 14, sourceLabels: ["14m", "5m"], basis: "derived", confidence: "high",
      notes: "Top view: 14 × 5 grid cells of 1 m confirm the labels. Gross plot area: includes storage-room and meeting-room footprints.",
      assumptions: ["Floor finish split (grey vinyl vs carpet) is not dimensioned."],
    }),
    makeMeasurement({
      ...ref, id: "emdad-m-front-elev", componentName: "Front elevation (gross rectangle)", category: "Walls",
      dimensions: dims({ width: "14", height: "4" }), derivation: { dims: ["width", "height"], multiplier: "1" },
      sourcePage: 15, sourceLabels: ["14m", "4m"], basis: "derived", confidence: "high",
      notes: "Front elevation: 14 × 4 grid cells confirm the labels. This is the gross elevation, not a wall material quantity: the front is open.",
    }),
    makeMeasurement({
      ...ref, id: "emdad-m-led-label", componentName: "LED screen (labelled size)", category: "LED & AV",
      dimensions: dims({ width: "4.5", height: "2.5" }), derivation: { dims: ["width", "height"], multiplier: "1" },
      sourcePage: 13, sourceLabels: ["LED screen 450x250cm"], basis: "derived", confidence: "high",
      notes: "From the explicit label on the annotated rendering.",
      queries: [makeQuery("emdad-q-led-m", "Elevation grid (p15) shows the LED at about 4.4 × 2.0 m, not 4.5 × 2.5 m. Which size is correct?", AT)],
    }),
    makeMeasurement({
      ...ref, id: "emdad-m-led-grid", componentName: "LED screen (as drawn in elevation)", category: "LED & AV",
      dimensions: dims({ width: "4.4", height: "2.0" }), derivation: { dims: ["width", "height"], multiplier: "1" },
      sourcePage: 15, sourceLabels: [], basis: "grid_scale", confidence: "medium",
      notes: "Measured against the 1 m elevation grid; panel seams suggest about 9 × 4 tiles of 0.5 m. Conflicts with the 450 × 250 cm label.",
    }),
    makeMeasurement({
      ...ref, id: "emdad-m-header", componentName: "Header fascia run (front + two sides)", category: "Structure",
      dimensions: dims({ length: "24" }), derivation: { dims: ["length"], multiplier: "1" },
      sourcePage: 15, sourceLabels: ["14m", "5m"], basis: "visual_estimate", confidence: "low",
      notes: "14 m front + 5 m + 5 m returns. Renderings p2–p6 show the header wrapping both short sides.",
      assumptions: ["Assumes the reference 'Header 24' means 24 linear metres. Unconfirmed."],
    }),
    makeMeasurement({
      ...ref, id: "emdad-m-header-h", componentName: "Header band height", category: "Structure",
      dimensions: dims({ height: "0.9" }), derivation: { dims: ["height"], multiplier: "1" },
      sourcePage: 15, basis: "grid_scale", confidence: "medium", notes: "Measured against the 1 m elevation grid.",
    }),
    makeMeasurement({
      ...ref, id: "emdad-m-carpet", componentName: "Carpet area (front trapezoid)", category: "Flooring",
      quantity: "12", unit: "m2", sourcePage: 14, sourceLabels: ["Carpet flooring (p13)"],
      basis: "grid_scale", confidence: "low", notes: "Approximate trapezoid area from the plan grid, before deducting the podium.",
    }),
    makeMeasurement({
      ...ref, id: "emdad-m-storage", componentName: "Storage room footprint", category: "Walls",
      dimensions: dims({ length: "1.9", width: "2.2" }), derivation: { dims: ["length", "width"], multiplier: "1" },
      sourcePage: 14, sourceLabels: ["Storage room (p13)"], basis: "grid_scale", confidence: "low",
    }),
    makeMeasurement({
      ...ref, id: "emdad-m-meeting", componentName: "Meeting room footprint", category: "Walls",
      dimensions: dims({ length: "3.0", width: "2.6" }), derivation: { dims: ["length", "width"], multiplier: "1" },
      sourcePage: 14, sourceLabels: ["Meeting room (p13)"], basis: "grid_scale", confidence: "low",
    }),
    makeMeasurement({
      ...ref, id: "emdad-m-reception", componentName: "Reception desk with push-through logo", category: "Furniture & joinery",
      derivation: { dims: [], multiplier: "1" }, sourcePage: 13, sourceLabels: ["Reception desk with push through logo"],
      basis: "explicit_label", confidence: "high",
    }),
    makeMeasurement({
      ...ref, id: "emdad-m-bar", componentName: "Bar / coffee counter", category: "Furniture & joinery",
      derivation: { dims: [], multiplier: "1" }, sourcePage: 10, basis: "visual_estimate", confidence: "medium",
    }),
    makeMeasurement({
      ...ref, id: "emdad-m-podium", componentName: "Display podium", category: "Furniture & joinery",
      derivation: { dims: [], multiplier: "1" }, sourcePage: 13, sourceLabels: ["Display podium"],
      basis: "explicit_label", confidence: "high",
    }),
    makeMeasurement({
      ...ref, id: "emdad-m-pushlogos", componentName: "Push-through logos", category: "Branding & graphics",
      derivation: { dims: [], multiplier: "3" }, sourcePage: 13, sourceLabels: ["Push through logo ×3"],
      basis: "explicit_label", confidence: "medium", notes: "Three separate callouts; sizes not given.",
    }),
    makeMeasurement({
      ...ref, id: "emdad-m-branding", componentName: "'BRANDING' placeholder panels", category: "Branding & graphics",
      derivation: { dims: [], multiplier: "5" }, sourcePage: 15, basis: "visual_estimate", confidence: "medium",
      notes: "Counted on the front elevation; sizes not given.",
    }),
    makeMeasurement({
      ...ref, id: "emdad-m-glass", componentName: "Meeting-room glass partition", category: "Glass",
      unit: "m2", sourcePage: 6, basis: "unresolved", confidence: "low",
      notes: "Visible in renderings p4, p6, p9, p11; no dimensions anywhere in the document.",
    }),
    makeMeasurement({
      ...ref, id: "emdad-m-platform", componentName: "Platform height", category: "Flooring",
      unit: "lm", basis: "unresolved", confidence: "low",
      notes: "Renderings suggest a low raised floor with LED skirting; no height stated.",
    }),
  ];
}

const provisional = (note: string): LineItem["rateSource"] => ({
  kind: "reference", catalogueItemId: null, catalogueRateId: null, verification: "provisional", note,
});
const refQty = (note: string): LineItem["quantitySource"] => ({ kind: "reference", measurementId: null, note });
const SRC = "XLive EMDAD reference costing";

/** The 11 reference lines exactly as provided; ambiguities are attached as queries, not resolved. */
export function emdadLineItems(): LineItem[] {
  return [
    makeLine({
      id: "emdad-l-floor", name: "Floor", category: "Flooring", costType: "material",
      quantityUnit: "m2", rate: "165", rateUnit: "m2",
      quantitySource: { kind: "measurement", measurementId: "emdad-m-floor", note: "14 × 5 m plot (p14)" },
      rateSource: provisional(SRC), customerDescription: "Raised booth flooring with finishes as per design",
      notes: "Drawing specifies grey vinyl with LED skirting plus a carpet area; the reference prices one floor rate.",
    }),
    makeLine({
      id: "emdad-l-header", name: "Header", category: "Structure", costType: "material",
      quantity: "24", quantityUnit: "unit_tbc", rate: "150", rateUnit: "unit_tbc",
      quantitySource: refQty(`${SRC}: quantity 24, unit not stated`), rateSource: provisional(SRC),
      customerDescription: "Header fascia with LED edge lighting",
      notes: "Possibly 24 lm (14 + 5 + 5); see measurement 'Header fascia run'.",
    }),
    makeLine({
      id: "emdad-l-counter", name: "Counter", category: "Furniture & joinery", costType: "material",
      quantity: "4", quantityUnit: "each", rate: "1500", rateUnit: "each",
      quantitySource: refQty(SRC), rateSource: provisional(SRC), customerDescription: "Counters and display podium",
      queries: [makeQuery("emdad-q-counter", "Which four items are counted as counters? Drawings show a reception desk, bar counter, display podium and storage cabinets.", AT)],
    }),
    makeLine({
      id: "emdad-l-wall", name: "Wall", category: "Walls", costType: "material",
      quantity: "56", quantityUnit: "m2", rate: "150", rateUnit: "m2",
      quantitySource: refQty(`${SRC}; equals the gross front elevation 14 × 4 m (p15)`), rateSource: provisional(SRC),
      customerDescription: "Booth walls, partitions and finishes",
      queries: [makeQuery("emdad-q-wall", "56 m² equals the gross front elevation (14 × 4 m), not a wall schedule. Confirm the wall material quantity (back wall, end walls, room partitions, faces, openings).", AT)],
    }),
    makeLine({
      id: "emdad-l-led", name: "LED wall", category: "LED & AV", costType: "equipment_rental", supplyBasis: "rent",
      quantity: "45", quantityUnit: "m2", rate: "350", rateUnit: "m2",
      quantitySource: refQty(`${SRC}: 45 m²`), rateSource: provisional(SRC), customerDescription: "LED video wall",
      queries: [makeQuery("emdad-q-led", "The drawing label gives 4.5 × 2.5 m = 11.25 m²; 45 m² is not supported by the drawings. Is 45 a count of 0.5 × 0.5 m cabinets (9 × 5)? Confirm quantity and unit.", AT)],
    }),
    makeLine({
      id: "emdad-l-electrical", name: "Electrical", category: "Electrical", costType: "subcontract",
      method: "lump_sum", quantityUnit: "lump_sum", rate: "3000", rateUnit: "lump_sum",
      quantitySource: refQty("1 job"), rateSource: provisional(SRC), customerDescription: "Electrical works and lighting",
    }),
    makeLine({
      id: "emdad-l-carpentry", name: "Carpentry", category: "Carpentry", costType: "labour",
      method: "lump_sum", quantityUnit: "lump_sum", rate: "5000", rateUnit: "lump_sum",
      quantitySource: refQty("1 job"), rateSource: provisional(SRC), customerDescription: "Carpentry and joinery",
    }),
    makeLine({
      id: "emdad-l-branding", name: "Branding", category: "Branding & graphics", costType: "material",
      quantity: "5", quantityUnit: "unit_tbc", rate: "350", rateUnit: "unit_tbc",
      quantitySource: refQty(`${SRC}: quantity 5, unit not stated`), rateSource: provisional(SRC),
      customerDescription: "Branding and graphics",
    }),
    makeLine({
      id: "emdad-l-installation", name: "Installation", category: "Installation", costType: "labour",
      method: "lump_sum", quantityUnit: "lump_sum", rate: "3000", rateUnit: "lump_sum",
      quantitySource: refQty("1 job"), rateSource: provisional(SRC), customerDescription: "Installation and dismantling",
    }),
    makeLine({
      id: "emdad-l-glass", name: "Glass", category: "Glass", costType: "material",
      quantity: "18", quantityUnit: "unit_tbc", rate: "250", rateUnit: "unit_tbc",
      quantitySource: refQty(`${SRC}: quantity 18, unit not stated`), rateSource: provisional(SRC),
      customerDescription: "Glass partitions", notes: "Only the meeting-room partition shows glass; no dimensions in the drawings.",
    }),
    makeLine({
      id: "emdad-l-hidden", name: "Hidden", category: "Unclassified", costType: "unclassified",
      method: "lump_sum", quantityUnit: "lump_sum", rate: "3000", rateUnit: "lump_sum",
      quantitySource: refQty("1 job"), rateSource: provisional(SRC),
      notes: "Original label preserved exactly as provided.",
      queries: [makeQuery("emdad-q-hidden", "What does 'Hidden' cover? The label is preserved as provided and must be clarified before quoting.", AT)],
    }),
  ];
}

export function emdadSampleEstimate(): Estimate {
  return {
    id: "sample-emdad",
    project: {
      projectName: "EMDAD exhibition booth 14 m × 5 m",
      clientName: "EMDAD",
      projectType: "exhibition_booth",
      venue: "",
      eventDates: "",
      estimator: "",
      notes: "Demo sample built from the EMDAD reference costing (provisional rates). 30 % markup as in the reference.",
    },
    status: "draft",
    documents: [],
    analysisRuns: [],
    costing: {
      currency: "SAR",
      measurements: emdadMeasurements(),
      lineItems: emdadLineItems(),
      pricing: { mode: "markup", markupRate: "0.30", marginRate: "0.30", fixedPrice: null, fixedPriceReason: "" },
      overhead: { mode: "none", value: null, note: "The reference costing has no separate overhead allowance." },
      contingency: { mode: "none", value: null, note: "The reference costing has no separate contingency allowance." },
      reconciliations: [],
      queries: [],
    },
    versions: [],
    quotations: [],
    sample: "emdad",
    createdAt: AT,
    updatedAt: AT,
  };
}
