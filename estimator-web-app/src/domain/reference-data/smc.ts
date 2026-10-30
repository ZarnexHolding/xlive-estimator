import type { Estimate } from "../estimate";
import { makeLine, makeMeasurement, makeQuery } from "../factories";
import type { LineItem, Measurement } from "../schemas";
import { REFERENCE_AT as AT } from "./documents";

const DOC = "ref-smc";
const ref = { origin: "reference_analysis", sourceDocumentId: DOC } as const;
const dims = (d: Partial<Measurement["dimensions"]>) => ({ length: null, width: null, height: null, depth: null, ...d });

/** Developer-prepared extraction of the SMC deck. Conflicting values are recorded side by side. Not AI output. */
export function smcMeasurements(): Measurement[] {
  return [
    makeMeasurement({
      ...ref, id: "smc-m-length", componentName: "Platform / runway length (plan)", category: "Structure",
      dimensions: dims({ length: "30" }), derivation: { dims: ["length"], multiplier: "1" },
      sourcePage: 16, sourceLabels: ["30M Length", "30M (p15)", "30m (L) (p21)"], basis: "explicit_label", confidence: "high",
      notes: "p16 draws the 30 m along the ground; the curved surface is longer than its plan length.",
    }),
    makeMeasurement({
      ...ref, id: "smc-m-width-3", componentName: "Platform width (3 m version)", category: "Structure",
      dimensions: dims({ width: "3" }), derivation: { dims: ["width"], multiplier: "1" },
      sourcePage: 16, sourceLabels: ["3m Width", "3M (p15)", "3m (W) (p21)"], basis: "explicit_label", confidence: "medium",
      queries: [makeQuery("smc-q-width", "Width conflict: 3 m on p15, p16 and p21 vs 3.5 m on p4 and p18. Which is correct?", AT)],
    }),
    makeMeasurement({
      ...ref, id: "smc-m-width-35", componentName: "Platform width (3.5 m version)", category: "Structure",
      dimensions: dims({ width: "3.5" }), derivation: { dims: ["width"], multiplier: "1" },
      sourcePage: 4, sourceLabels: ["Dim : 3.5 x 30 x 0.4/5m Height"], basis: "explicit_label", confidence: "medium",
    }),
    makeMeasurement({
      ...ref, id: "smc-m-base-h", componentName: "Base height", category: "Structure",
      dimensions: dims({ height: "0.4" }), derivation: { dims: ["height"], multiplier: "1" },
      sourcePage: 16, sourceLabels: ["40cm Height", "40cm (H) (p15)", "0.4/5m"], basis: "explicit_label", confidence: "high",
    }),
    makeMeasurement({
      ...ref, id: "smc-m-peak-5", componentName: "Tallest structural height (5 m version)", category: "Structure",
      dimensions: dims({ height: "5" }), derivation: { dims: ["height"], multiplier: "1" },
      sourcePage: 16, sourceLabels: ["5M Height", "0.4/5m (H) (p21)"], basis: "explicit_label", confidence: "medium",
      queries: [makeQuery("smc-q-height", "Peak height conflict: 5 m on p16 and p21 vs 2.5 m on p15. Which is correct?", AT)],
    }),
    makeMeasurement({
      ...ref, id: "smc-m-peak-25", componentName: "Tallest structural height (2.5 m version)", category: "Structure",
      dimensions: dims({ height: "2.5" }), derivation: { dims: ["height"], multiplier: "1" },
      sourcePage: 15, sourceLabels: ["2.5M (H)"], basis: "explicit_label", confidence: "medium",
    }),
    makeMeasurement({
      ...ref, id: "smc-m-oled", componentName: "OLED side panels (2 sides)", category: "LED & AV",
      dimensions: dims({ length: "9", height: "0.75" }), derivation: { dims: ["length", "height"], multiplier: "2" },
      sourcePage: 21, sourceLabels: ["OLED SIDE Panels 9m x 0.75m", "9 meters each side of the car (x2)"],
      basis: "derived", confidence: "high",
      notes: "Product type not chosen: 'Transparent OLED screens or flexible OLED video walls'.",
    }),
    makeMeasurement({
      ...ref, id: "smc-m-led-nominal", componentName: "Floor LED runway (nominal)", category: "LED & AV",
      dimensions: dims({ length: "30", width: "3" }), derivation: { dims: ["length", "width"], multiplier: "1" },
      sourcePage: 21, sourceLabels: ["FLoor LED Runway 30mx3m"], basis: "derived", confidence: "low",
      notes: "Upper-bound nominal area from the spec text. P3–P5 outdoor-rated pitch range; product not chosen.",
      queries: [makeQuery("smc-q-led", "Actual LED area is unresolved: width conflict (3 vs 3.5 m), the curved surface is longer than 30 m, renderings show the LED inset within cladding, and the steep section may need a different product.", AT)],
    }),
    makeMeasurement({
      ...ref, id: "smc-m-cladding", componentName: "SS mirror-finish cladding area", category: "Cladding",
      unit: "m2", sourcePage: 15, sourceLabels: ["SS Mirror Finish Cladding"], basis: "unresolved", confidence: "low",
      notes: "Side profile curve is not defined (no radius or coordinates); the area cannot be derived.",
    }),
    makeMeasurement({
      ...ref, id: "smc-m-frame", componentName: "MS structural frame", category: "Structure",
      unit: "kg", sourcePage: 21, sourceLabels: ["MS frame"], basis: "unresolved", confidence: "low",
      notes: "Requires structural design (car load, wind, outdoor exposure).",
    }),
    makeMeasurement({
      ...ref, id: "smc-m-neon", componentName: "LED neon / RGB edge lighting", category: "Lighting",
      unit: "lm", sourcePage: 15, sourceLabels: ["LED Neon Lights", "Embedded underlighting with RGB Floor LEDs"],
      basis: "unresolved", confidence: "low", notes: "Appears to run along both runway edges; no length given.",
    }),
    makeMeasurement({
      ...ref, id: "smc-m-control", componentName: "Media server + DMX control", category: "LED & AV",
      derivation: { dims: [], multiplier: "1" }, sourcePage: 21, sourceLabels: ["Control: DMX + Media Server"],
      basis: "explicit_label", confidence: "medium", notes: "Specification not given.",
    }),
  ];
}

const unpriced = (init: Parameters<typeof makeLine>[0]): LineItem =>
  makeLine({ rateSource: { kind: "none", catalogueItemId: null, catalogueRateId: null, verification: null, note: "No rate available for this project" }, ...init });
const fromMeasurement = (measurementId: string, note = ""): LineItem["quantitySource"] => ({ kind: "measurement", measurementId, note });

export function smcLineItems(): LineItem[] {
  return [
    unpriced({ id: "smc-l-led", name: "Floor LED runway", category: "LED & AV", costType: "equipment_rental", quantityUnit: "m2", rateUnit: "m2", quantitySource: fromMeasurement("smc-m-led-nominal") }),
    unpriced({ id: "smc-l-oled", name: "OLED side panels", category: "LED & AV", costType: "equipment_rental", quantityUnit: "m2", rateUnit: "m2", quantitySource: fromMeasurement("smc-m-oled") }),
    unpriced({ id: "smc-l-cladding", name: "SS mirror-finish cladding", category: "Cladding", costType: "material", quantityUnit: "m2", rateUnit: "m2", quantitySource: fromMeasurement("smc-m-cladding") }),
    unpriced({ id: "smc-l-frame", name: "MS structural frame", category: "Structure", costType: "material", quantityUnit: "kg", rateUnit: "kg", quantitySource: fromMeasurement("smc-m-frame") }),
    unpriced({ id: "smc-l-neon", name: "LED neon / RGB lighting", category: "Lighting", costType: "material", quantityUnit: "lm", rateUnit: "lm", quantitySource: fromMeasurement("smc-m-neon") }),
    unpriced({ id: "smc-l-control", name: "Media server + DMX control", category: "LED & AV", costType: "equipment_rental", quantityUnit: "each", rateUnit: "each", quantitySource: fromMeasurement("smc-m-control") }),
    unpriced({ id: "smc-l-content", name: "Content production (motion graphics)", category: "Content", costType: "subcontract", method: "lump_sum", quantityUnit: "lump_sum", rateUnit: "lump_sum" }),
    unpriced({ id: "smc-l-structural", name: "Structural engineering design", category: "Engineering", costType: "subcontract", method: "lump_sum", quantityUnit: "lump_sum", rateUnit: "lump_sum" }),
    unpriced({ id: "smc-l-install", name: "Installation and dismantling", category: "Installation", costType: "labour", method: "lump_sum", quantityUnit: "lump_sum", rateUnit: "lump_sum" }),
    unpriced({ id: "smc-l-transport", name: "Transport and lifting", category: "Logistics", costType: "transport", method: "lump_sum", quantityUnit: "lump_sum", rateUnit: "lump_sum" }),
  ];
}

export function smcSampleEstimate(): Estimate {
  return {
    id: "sample-smc",
    project: {
      projectName: "SMC Paddock F1 car display (V2)",
      clientName: "SMC",
      projectType: "led_stage_or_runway",
      venue: "Jeddah Corniche Circuit paddock (per design deck)",
      eventDates: "",
      estimator: "",
      notes: "Demo sample: quantities only. No rates exist for this project, so no cost is shown. Third-party design deck.",
    },
    status: "draft",
    documents: [],
    analysisRuns: [],
    costing: {
      currency: "SAR",
      measurements: smcMeasurements(),
      lineItems: smcLineItems(),
      pricing: { mode: "markup", markupRate: "0.30", marginRate: "0.30", fixedPrice: null, fixedPriceReason: "" },
      overhead: { mode: "not_set", value: null, note: "" },
      contingency: { mode: "not_set", value: null, note: "" },
      reconciliations: [],
      queries: [
        makeQuery("smc-q-type", "The deck shows two design options (Type 01 and Type 02); the spec page does not say which. Which option is being costed?", AT),
      ],
    },
    versions: [],
    quotations: [],
    sample: "smc",
    createdAt: AT,
    updatedAt: AT,
  };
}
