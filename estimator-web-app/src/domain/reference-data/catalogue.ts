import type { CatalogueItem } from "../catalogue";
import type { CostType } from "../schemas";
import type { Unit } from "../units";
import { REFERENCE_AT } from "./documents";

const SOURCE = "EMDAD reference costing (provisional, not a verified market price)";
const noSpecs = { thicknessMm: null, sheetLengthMm: null, sheetWidthMm: null };

function provisional(id: string, name: string, category: string, unit: Unit, costType: CostType, rate: string, notes = ""): CatalogueItem {
  return {
    id,
    name,
    category,
    unit,
    costType,
    supplier: "",
    notes,
    active: true,
    specs: noSpecs,
    rates: [
      {
        id: `${id}-r1`,
        rate,
        currency: "SAR",
        verification: "provisional",
        source: SOURCE,
        effectiveFrom: "2026-10-01",
        recordedAt: REFERENCE_AT,
      },
    ],
    updatedAt: REFERENCE_AT,
  };
}

/** Starter catalogue: the EMDAD reference rates, all flagged provisional. */
export function referenceCatalogue(): CatalogueItem[] {
  return [
    provisional("cat-floor", "Booth floor (raised, finished)", "Flooring", "m2", "material", "165"),
    provisional("cat-wall", "Wall / partition (built, finished)", "Walls", "m2", "material", "150"),
    provisional("cat-led-wall", "LED video wall", "LED & AV", "m2", "equipment_rental", "350",
      "Reference quantity basis disputed (45 'm²' vs 11.25 m² drawn); confirm whether this rate is per m² or per cabinet."),
    provisional("cat-counter", "Counter / desk", "Furniture & joinery", "each", "material", "1500"),
    provisional("cat-header", "Header fascia", "Structure", "unit_tbc", "material", "150", "Unit not confirmed (possibly per linear metre)."),
    provisional("cat-branding", "Branding item", "Branding & graphics", "unit_tbc", "material", "350", "Unit not confirmed."),
    provisional("cat-glass", "Glass", "Glass", "unit_tbc", "material", "250", "Unit not confirmed (m² or panel)."),
    provisional("cat-electrical", "Electrical works (booth)", "Electrical", "lump_sum", "subcontract", "3000"),
    provisional("cat-carpentry", "Carpentry (booth)", "Carpentry", "lump_sum", "labour", "5000"),
    provisional("cat-installation", "Installation (booth)", "Installation", "lump_sum", "labour", "3000"),
    {
      ...provisional("cat-mdf18", "MDF board 18 mm", "Carpentry materials", "sheet", "material", "0"),
      rates: [],
      specs: { thicknessMm: "18", sheetLengthMm: null, sheetWidthMm: null },
      notes: "No verified sheet price yet. IDCUBE lists a SAR 3,000 lump sum without a sheet count.",
    },
  ];
}
