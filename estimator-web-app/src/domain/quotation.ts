import type { EstimateVersion } from "./estimate";
import { dec } from "./money";
import type { ProjectType } from "./schemas";
import type { CompanySettings } from "./settings";
import { UNIT_LABELS } from "./units";
import { verifyVersion } from "./versioning";

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  exhibition_booth: "Exhibition booth",
  custom_display_stand: "Custom display stand",
  led_stage_or_runway: "LED stage or runway",
  retail_display: "Retail display",
  brand_activation: "Brand activation",
  custom_installation: "Custom installation",
  other_event_production: "Other event production",
};

/**
 * The customer-facing quotation. It deliberately carries no unit rates, line amounts,
 * cost breakdowns or markup: only scope descriptions and the agreed pre-VAT total.
 */
export interface QuotationDocument {
  number: string;
  issueDate: string;
  validUntil: string;
  company: CompanySettings;
  client: { name: string; projectName: string; projectType: string; venue: string; eventDates: string };
  currency: string;
  scope: { description: string; quantity: string | null }[];
  totalExVat: string;
  vat: { treatment: "excluded"; statement: string };
  terms: string[];
  exclusions: string[];
  basis: string[];
  source: { versionId: string; versionNo: number; approvedAt: string; approvedBy: string };
}

export class QuotationError extends Error {}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Build a quotation from an approved, immutable estimate version. */
export function buildQuotation(
  version: EstimateVersion,
  settings: CompanySettings,
  options: { number: string; issueDate: string },
): QuotationDocument {
  const calc = version.calculation;
  if (!calc.readyForQuotation || calc.sellingPriceExVat === null) {
    throw new QuotationError("Only a complete, approved estimate version can be quoted.");
  }
  const integrity = verifyVersion(version);
  if (!integrity.ok) {
    throw new QuotationError(
      `Approved version v${version.versionNo} no longer reproduces its stored total; quotation blocked.`,
    );
  }

  const resultById = new Map(calc.lines.map((l) => [l.lineId, l]));
  const scope = version.costing.lineItems
    .filter((l) => l.included && l.supplyBasis !== "client_supplied" && resultById.get(l.id)?.amount !== null)
    .map((l) => {
      const result = resultById.get(l.id)!;
      return {
        description: l.customerDescription?.trim() || l.name,
        quantity:
          l.method === "quantity_x_rate" && result.quantity !== null
            ? `${dec(result.quantity).toString()} ${UNIT_LABELS[result.quantityUnit].short}`
            : null,
      };
    });

  const clientSupplied = version.costing.lineItems.filter((l) => l.included && l.supplyBasis === "client_supplied");
  const documents = version.documents.map((d) => d.fileName);

  return {
    number: options.number,
    issueDate: options.issueDate,
    validUntil: addDays(options.issueDate, settings.quotationValidityDays),
    company: settings,
    client: {
      name: version.project.clientName,
      projectName: version.project.projectName,
      projectType: PROJECT_TYPE_LABELS[version.project.projectType],
      venue: version.project.venue,
      eventDates: version.project.eventDates,
    },
    currency: version.costing.currency,
    scope,
    totalExVat: calc.sellingPriceExVat,
    vat: {
      treatment: "excluded",
      statement: "All prices exclude Value Added Tax (VAT). This document is a quotation, not a tax invoice.",
    },
    terms: settings.terms,
    exclusions: [
      ...settings.exclusions,
      ...clientSupplied.map((l) => `${l.customerDescription?.trim() || l.name} (client-supplied)`),
    ],
    basis: documents.length > 0 ? [`Based on design document(s): ${documents.join(", ")}.`] : [],
    source: {
      versionId: version.id,
      versionNo: version.versionNo,
      approvedAt: version.approvedAt,
      approvedBy: version.approvedBy,
    },
  };
}
