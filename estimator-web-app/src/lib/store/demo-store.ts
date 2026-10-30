import { z } from "zod";
import { addRateVersion, CatalogueItemSchema, type CatalogueItem, type CatalogueRate } from "@/domain/catalogue";
import { EstimateSchema, type Estimate, type QuotationRecord } from "@/domain/estimate";
import { buildQuotation } from "@/domain/quotation";
import { referenceCatalogue } from "@/domain/reference-data/catalogue";
import { emdadSampleEstimate } from "@/domain/reference-data/emdad";
import { idcubeSampleEstimate } from "@/domain/reference-data/idcube";
import { smcSampleEstimate } from "@/domain/reference-data/smc";
import { CompanySettingsSchema, DEFAULT_COMPANY_SETTINGS, type CompanySettings } from "@/domain/settings";
import type { DocumentRef } from "@/domain/schemas";
import { approveEstimate } from "@/domain/versioning";
import { clearDocumentFiles, deleteDocumentFile, getDocumentFile, putDocumentFile } from "@/lib/demo/docs-db";
import { newId } from "@/lib/ids";
import type { AppStore, ApprovalInput, StoreSnapshot } from "./types";

/**
 * Demo-mode persistence: this browser's localStorage (estimates) and IndexedDB (PDFs) only.
 * Nothing here reaches a database, and the UI says so. Everything read back is validated.
 */
const KEYS = {
  estimates: "xlive.v1.estimates",
  catalogue: "xlive.v1.catalogue",
  settings: "xlive.v1.settings",
  seeded: "xlive.v1.seeded",
} as const;

const SERVER_SNAPSHOT: StoreSnapshot = {
  mode: "demo",
  ready: false,
  context: null,
  estimates: [],
  catalogue: [],
  settings: DEFAULT_COMPANY_SETTINGS,
  loadErrors: [],
};

function readArray<T>(key: string, schema: z.ZodType<T>, label: string, errors: string[]): T[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    errors.push(`Stored ${label} could not be read and were ignored.`);
    return [];
  }
  if (!Array.isArray(data)) return [];
  const valid: T[] = [];
  data.forEach((item, i) => {
    const parsed = schema.safeParse(item);
    if (parsed.success) valid.push(parsed.data);
    else errors.push(`Stored ${label} #${i + 1} failed validation and was not loaded.`);
  });
  return valid;
}

/** Next sequential reference, e.g. XLQ-2026-0003, across all estimates in this browser. */
export function nextQuotationNumber(estimates: Estimate[], prefix: string, year: number): string {
  const stem = `${prefix}-${year}-`;
  const used = estimates.flatMap((e) => e.quotations.map((q) => q.number)).filter((n) => n.startsWith(stem));
  const max = used.reduce((m, n) => Math.max(m, Number(n.slice(stem.length)) || 0), 0);
  return `${stem}${String(max + 1).padStart(4, "0")}`;
}

export class DemoStore implements AppStore {
  readonly mode = "demo" as const;
  private snapshot: StoreSnapshot = SERVER_SNAPSHOT;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => SERVER_SNAPSHOT;

  private emit(next: Partial<StoreSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((l) => l());
  }

  load() {
    if (this.snapshot.ready) return;
    const errors: string[] = [];
    if (!localStorage.getItem(KEYS.seeded)) this.seed();
    const estimates = readArray(KEYS.estimates, EstimateSchema, "estimates", errors);
    const catalogue = readArray(KEYS.catalogue, CatalogueItemSchema, "catalogue items", errors);
    let settings = DEFAULT_COMPANY_SETTINGS;
    const rawSettings = localStorage.getItem(KEYS.settings);
    if (rawSettings) {
      try {
        const parsed = CompanySettingsSchema.safeParse(JSON.parse(rawSettings));
        if (parsed.success) settings = parsed.data;
        else errors.push("Stored company settings failed validation; defaults are shown.");
      } catch {
        errors.push("Stored company settings could not be read; defaults are shown.");
      }
    }
    this.emit({ ready: true, estimates, catalogue, settings, loadErrors: errors });
  }

  async reload() {
    this.snapshot = SERVER_SNAPSHOT;
    this.load();
  }

  private seed() {
    const samples = [emdadSampleEstimate(), idcubeSampleEstimate(), smcSampleEstimate()];
    localStorage.setItem(KEYS.estimates, JSON.stringify(samples));
    localStorage.setItem(KEYS.catalogue, JSON.stringify(referenceCatalogue()));
    localStorage.setItem(KEYS.seeded, new Date().toISOString());
  }

  private persist(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      throw new Error("Browser storage is full or unavailable. The change was not saved.");
    }
  }

  async saveEstimate(estimate: Estimate) {
    const valid = EstimateSchema.parse(estimate);
    const exists = this.snapshot.estimates.some((e) => e.id === valid.id);
    const estimates = exists ? this.snapshot.estimates.map((e) => (e.id === valid.id ? valid : e)) : [valid, ...this.snapshot.estimates];
    this.persist(KEYS.estimates, estimates);
    this.emit({ estimates });
  }

  async whenSaved() {}

  async deleteEstimate(estimate: Estimate) {
    if (estimate.versions.length > 0) throw new Error("Estimates with approved versions cannot be deleted. Archive it instead.");
    const estimates = this.snapshot.estimates.filter((e) => e.id !== estimate.id);
    const stillUsed = new Set(estimates.flatMap((e) => e.documents.map((d) => d.id)));
    this.persist(KEYS.estimates, estimates);
    this.emit({ estimates });
    await Promise.all(estimate.documents.filter((d) => !stillUsed.has(d.id)).map((d) => deleteDocumentFile(d.id)));
  }

  async putDocument(_estimateId: string, doc: DocumentRef, file: Blob) {
    await putDocumentFile(doc.id, file);
  }
  async getDocumentFile(_estimateId: string, documentId: string) {
    return (await getDocumentFile(documentId)) ?? null;
  }
  async removeDocumentFile(_estimateId: string, documentId: string) {
    const used = this.snapshot.estimates.some((e) => e.documents.some((d) => d.id === documentId));
    if (!used) await deleteDocumentFile(documentId);
  }

  async approve(estimate: Estimate, input: ApprovalInput) {
    const approved = approveEstimate(estimate, { versionId: newId(), at: new Date().toISOString(), ...input });
    await this.saveEstimate(approved);
  }

  async issueQuotation(estimate: Estimate, versionId: string) {
    const version = estimate.versions.find((v) => v.id === versionId);
    if (!version) throw new Error("Approved version not found.");
    const settings = this.snapshot.settings;
    const issueDate = new Date().toISOString().slice(0, 10);
    const number = nextQuotationNumber(this.snapshot.estimates, settings.quotationPrefix, Number(issueDate.slice(0, 4)));
    const document = buildQuotation(version, settings, { number, issueDate });
    const record: QuotationRecord = {
      id: newId(),
      number,
      versionId: version.id,
      versionNo: version.versionNo,
      issueDate,
      validUntil: document.validUntil,
      totalExVat: document.totalExVat,
      currency: document.currency,
      vatTreatment: "excluded",
      format: "summary",
      settingsSnapshot: structuredClone(settings),
      createdAt: new Date().toISOString(),
    };
    await this.saveEstimate({
      ...estimate,
      status: estimate.status === "approved" ? "quoted" : estimate.status,
      quotations: [...estimate.quotations, record],
      updatedAt: record.createdAt,
    });
    return { record, document };
  }

  private saveCatalogue(items: CatalogueItem[]) {
    const valid = z.array(CatalogueItemSchema).parse(items);
    this.persist(KEYS.catalogue, valid);
    this.emit({ catalogue: valid });
  }
  async addCatalogueItem(item: CatalogueItem) {
    this.saveCatalogue([...this.snapshot.catalogue, item]);
  }
  async addCatalogueRate(itemId: string, rate: CatalogueRate) {
    this.saveCatalogue(this.snapshot.catalogue.map((c) => (c.id === itemId ? addRateVersion(c, rate) : c)));
  }
  async setCatalogueItemActive(itemId: string, active: boolean) {
    this.saveCatalogue(this.snapshot.catalogue.map((c) => (c.id === itemId ? { ...c, active, updatedAt: new Date().toISOString() } : c)));
  }

  async saveSettings(settings: CompanySettings) {
    const valid = CompanySettingsSchema.parse(settings);
    this.persist(KEYS.settings, valid);
    this.emit({ settings: valid });
  }

  async resetDemoData() {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    await clearDocumentFiles();
    await this.reload();
  }
}
