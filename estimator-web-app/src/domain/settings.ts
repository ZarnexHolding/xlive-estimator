import { z } from "zod";
import { CurrencySchema } from "./schemas";

export const CompanySettingsSchema = z.object({
  companyName: z.string().min(1),
  legalName: z.string(),
  addressLines: z.array(z.string()),
  phone: z.string(),
  email: z.string(),
  website: z.string(),
  commercialRegistration: z.string(),
  vatNumber: z.string(),
  defaultCurrency: CurrencySchema,
  quotationPrefix: z.string().min(1),
  quotationValidityDays: z.number().int().positive().max(365),
  terms: z.array(z.string()),
  exclusions: z.array(z.string()),
});
export type CompanySettings = z.infer<typeof CompanySettingsSchema>;

/**
 * Defaults. Contact details are taken from the footer of XLive's own reference decks;
 * terms and exclusions are placeholders that XLive must review before issuing quotations.
 */
export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  companyName: "XLive Production",
  legalName: "Zarnex Holding Company",
  addressLines: [
    "Building no. 7436, 7th floor, Salah El Din El Ayouby Street",
    "Al-Malaz District, 12629 Riyadh, Saudi Arabia",
  ],
  phone: "+966 53 430 7007",
  email: "",
  website: "xlive-pro.com",
  commercialRegistration: "",
  vatNumber: "",
  defaultCurrency: "SAR",
  quotationPrefix: "XLQ",
  quotationValidityDays: 30,
  terms: [
    "[Placeholder: XLive to confirm] Payment terms to be agreed in writing before production starts.",
    "[Placeholder: XLive to confirm] Design changes after approval may change the quoted price.",
  ],
  exclusions: [
    "Value Added Tax (VAT). This quotation is an estimate, not a tax invoice.",
    "[Placeholder: XLive to confirm] Venue charges, power connection fees and permits unless listed.",
  ],
};
