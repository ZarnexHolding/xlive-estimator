import { z } from "zod";
import { DimensionKeySchema, UnitSchema } from "./schemas";

/**
 * Reusable quantity rules. Rules only produce quantities (via a measurement derivation);
 * money is always quantity × rate in the costing engine.
 */
export const CostingRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  formula: z.string(),
  dims: z.array(DimensionKeySchema),
  outputUnit: UnitSchema,
  status: z.enum(["active", "needs_confirmation", "not_implemented"]),
  description: z.string(),
  assumptions: z.array(z.string()),
});
export type CostingRule = z.infer<typeof CostingRuleSchema>;

export const STANDARD_RULES: CostingRule[] = [
  { id: "rule-floor-area", name: "Floor area", formula: "length × width", dims: ["length", "width"], outputUnit: "m2", status: "active", description: "Plot or finish area of a rectangular floor.", assumptions: ["Rectangular area; cut-outs must be measured and handled explicitly, never assumed."] },
  { id: "rule-wall-gross", name: "Rectangular wall area (gross)", formula: "width × height", dims: ["width", "height"], outputUnit: "m2", status: "active", description: "Gross face area of one wall face.", assumptions: ["Openings are not deducted; both faces need two measurements or a multiplier of 2."] },
  { id: "rule-linear", name: "Linear run", formula: "length", dims: ["length"], outputUnit: "lm", status: "active", description: "Fascia, skirting, LED strip, trims.", assumptions: [] },
  { id: "rule-count", name: "Count of identical items", formula: "n", dims: [], outputUnit: "each", status: "active", description: "Counters, screens, logos: n × rate per piece.", assumptions: [] },
  { id: "rule-volume", name: "Volume", formula: "length × width × height", dims: ["length", "width", "height"], outputUnit: "m3", status: "active", description: "Volumetric items or transport volume.", assumptions: [] },
  { id: "rule-labour-days", name: "Labour days", formula: "crew × days", dims: [], outputUnit: "day", status: "needs_confirmation", description: "Enter crew-days directly; productivity norms not yet supplied by XLive.", assumptions: ["No productivity rates are assumed."] },
  { id: "rule-rental", name: "Equipment rental duration", formula: "units × days", dims: [], outputUnit: "day", status: "needs_confirmation", description: "Rental items priced per day.", assumptions: ["Event and build days must be confirmed per project."] },
  { id: "rule-sheet", name: "Sheet material optimisation", formula: "—", dims: [], outputUnit: "sheet", status: "not_implemented", description: "Sheet count from cutting layout, kerf, offcuts and waste.", assumptions: ["Not implemented until XLive documents its construction and nesting assumptions. Use a per-m² rate or a manual sheet count with a note."] },
];
