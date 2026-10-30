import { CompanySettingsSchema, DEFAULT_COMPANY_SETTINGS, type CompanySettings } from "@/domain/settings";

/** company_settings row ⇄ domain settings. Missing values fall back to the defaults. */
export interface CompanySettingsRow {
  organisation_id: string;
  company_name: string;
  legal_name: string;
  address_lines: string[];
  phone: string;
  email: string;
  website: string;
  commercial_registration: string;
  vat_number: string;
  default_currency: string;
  quotation_prefix: string;
  quotation_validity_days: number;
  terms: string[];
  exclusions: string[];
}

export function settingsFromRow(row: CompanySettingsRow | null): { settings: CompanySettings; valid: boolean } {
  if (!row) return { settings: DEFAULT_COMPANY_SETTINGS, valid: false };
  const parsed = CompanySettingsSchema.safeParse({
    companyName: row.company_name,
    legalName: row.legal_name,
    addressLines: row.address_lines,
    phone: row.phone,
    email: row.email,
    website: row.website,
    commercialRegistration: row.commercial_registration,
    vatNumber: row.vat_number,
    defaultCurrency: row.default_currency?.trim(),
    quotationPrefix: row.quotation_prefix,
    quotationValidityDays: row.quotation_validity_days,
    terms: row.terms,
    exclusions: row.exclusions,
  });
  return parsed.success ? { settings: parsed.data, valid: true } : { settings: DEFAULT_COMPANY_SETTINGS, valid: false };
}

export function settingsToRow(organisationId: string, s: CompanySettings): CompanySettingsRow {
  return {
    organisation_id: organisationId,
    company_name: s.companyName,
    legal_name: s.legalName,
    address_lines: s.addressLines,
    phone: s.phone,
    email: s.email,
    website: s.website,
    commercial_registration: s.commercialRegistration,
    vat_number: s.vatNumber,
    default_currency: s.defaultCurrency,
    quotation_prefix: s.quotationPrefix,
    quotation_validity_days: s.quotationValidityDays,
    terms: s.terms,
    exclusions: s.exclusions,
  };
}

/** Turn a Postgres/PostgREST error into a message safe and useful for the estimator. */
export function friendlyDbError(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return "Unknown database error.";
  if (error.code === "42501" || /row-level security/i.test(error.message ?? "")) {
    return error.message && !/row-level security/i.test(error.message) ? error.message : "You do not have permission to make this change.";
  }
  if (error.code === "23505") return "This record already exists.";
  return error.message || "The database rejected the change.";
}
