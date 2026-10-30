import { z } from "zod";
import { CatalogueItemSchema, type CatalogueItem, type CatalogueRate } from "@/domain/catalogue";
import { EstimateSchema, QuotationRecordSchema, type Estimate } from "@/domain/estimate";
import type { QuotationDocument } from "@/domain/quotation";
import type { DocumentRef } from "@/domain/schemas";
import { CompanySettingsSchema, DEFAULT_COMPANY_SETTINGS, type CompanySettings } from "@/domain/settings";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { DOCUMENTS_BUCKET, documentPath } from "@/lib/supabase/config";
import { friendlyDbError, settingsFromRow, settingsToRow, type CompanySettingsRow } from "@/lib/supabase/mappers";
import { AppContextSchema, type AppStore, type ApprovalInput, type StoreSnapshot } from "./types";

const INITIAL: StoreSnapshot = {
  mode: "supabase",
  ready: false,
  context: null,
  estimates: [],
  catalogue: [],
  settings: DEFAULT_COMPANY_SETTINGS,
  loadErrors: [],
};

interface SaveQueue {
  pending: Estimate | null;
  running: Promise<void> | null;
  waiters: { resolve: () => void; reject: (e: Error) => void }[];
}

function parseList<T>(data: unknown, schema: z.ZodType<T>, label: string, errors: string[]): T[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((item, i) => {
    const parsed = schema.safeParse(item);
    if (parsed.success) return [parsed.data];
    errors.push(`${label} #${i + 1} failed validation and was not loaded.`);
    return [];
  });
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Network error: the server could not be reached.");
  }
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (json as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(message ?? `Request failed (HTTP ${response.status}).`);
  }
  return json as T;
}

/**
 * Connected mode: Supabase Postgres + Storage, protected by Row Level Security.
 * Edits update the UI immediately and are saved in order per estimate; queued saves are
 * coalesced because each save sends the complete estimate. A failed save reloads the
 * estimate from the database, so the screen never shows unsaved data as saved.
 */
export class SupabaseStore implements AppStore {
  readonly mode = "supabase" as const;
  private snapshot: StoreSnapshot = INITIAL;
  private listeners = new Set<() => void>();
  private loading = false;
  private queues = new Map<string, SaveQueue>();
  private files = new Map<string, Blob>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => INITIAL;

  private emit(next: Partial<StoreSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((l) => l());
  }

  private get db() {
    return getBrowserSupabase();
  }

  private get organisationId(): string {
    const org = this.snapshot.context?.organisationId;
    if (!org) throw new Error("You are not a member of an organisation yet.");
    return org;
  }

  load() {
    if (this.snapshot.ready || this.loading) return;
    void this.reload();
  }

  async reload() {
    this.loading = true;
    try {
      const errors: string[] = [];
      const { data: rawContext, error } = await this.db.rpc("get_app_context");
      const context = AppContextSchema.safeParse(rawContext);
      if (error || !context.success) {
        this.emit({ ready: true, context: null, estimates: [], catalogue: [], loadErrors: [error ? friendlyDbError(error) : "Not signed in."] });
        return;
      }
      if (!context.data.organisationId) {
        this.emit({ ready: true, context: context.data, estimates: [], catalogue: [], loadErrors: [] });
        return;
      }
      const [estimates, catalogue, settingsRow] = await Promise.all([
        this.db.rpc("load_estimates"),
        this.db.rpc("load_catalogue"),
        this.db.from("company_settings").select("*").maybeSingle<CompanySettingsRow>(),
      ]);
      for (const r of [estimates, catalogue, settingsRow]) if (r.error) errors.push(friendlyDbError(r.error));
      const { settings, valid } = settingsFromRow(settingsRow.data ?? null);
      if (!valid) errors.push("Company settings are incomplete; defaults are shown until an administrator saves them.");
      this.emit({
        ready: true,
        context: context.data,
        estimates: parseList(estimates.data, EstimateSchema, "Estimate", errors),
        catalogue: parseList(catalogue.data, CatalogueItemSchema, "Catalogue item", errors),
        settings,
        loadErrors: errors,
      });
    } finally {
      this.loading = false;
    }
  }

  private async refreshEstimate(id: string) {
    const { data, error } = await this.db.rpc("load_estimates", { p_id: id });
    if (error) return;
    const fresh = Array.isArray(data) ? EstimateSchema.safeParse(data[0]) : null;
    const others = this.snapshot.estimates.filter((e) => e.id !== id);
    this.emit({ estimates: fresh?.success ? [fresh.data, ...others].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : others });
  }

  // ---------------------------------------------------------------------------
  // Estimates

  saveEstimate(estimate: Estimate): Promise<void> {
    if (this.snapshot.context?.role === "viewer") throw new Error("Your role is read-only.");
    const valid = EstimateSchema.parse(estimate);
    const exists = this.snapshot.estimates.some((e) => e.id === valid.id);
    this.emit({ estimates: exists ? this.snapshot.estimates.map((e) => (e.id === valid.id ? valid : e)) : [valid, ...this.snapshot.estimates] });

    const queue = this.queues.get(valid.id) ?? { pending: null, running: null, waiters: [] };
    this.queues.set(valid.id, queue);
    queue.pending = valid;
    const done = new Promise<void>((resolve, reject) => queue.waiters.push({ resolve, reject }));
    queue.running ??= this.drain(valid.id, queue);
    return done;
  }

  private async drain(id: string, queue: SaveQueue) {
    while (queue.pending) {
      const payload = queue.pending;
      queue.pending = null;
      const waiters = queue.waiters.splice(0);
      const { error } = await this.db.rpc("save_estimate", { payload });
      if (error) {
        const failure = new Error(`Not saved: ${friendlyDbError(error)}`);
        waiters.forEach((w) => w.reject(failure));
        queue.pending = null;
        queue.waiters.splice(0).forEach((w) => w.reject(failure));
        await this.refreshEstimate(id);
      } else {
        waiters.forEach((w) => w.resolve());
      }
    }
    queue.running = null;
  }

  whenSaved(estimateId: string) {
    return this.flush(estimateId);
  }

  /** Wait until every queued save for this estimate has reached the database. */
  private async flush(id: string) {
    const queue = this.queues.get(id);
    while (queue?.running) await queue.running;
  }

  async deleteEstimate(estimate: Estimate) {
    if (estimate.versions.length > 0) throw new Error("Estimates with approved versions cannot be deleted. Archive it instead.");
    await this.flush(estimate.id);
    // The project row owns the estimate and its documents (cascade).
    const { error } = await this.db.from("projects").delete().eq("id", estimate.id);
    if (error) throw new Error(friendlyDbError(error));
    if (estimate.documents.length > 0) {
      await this.db.storage.from(DOCUMENTS_BUCKET).remove(estimate.documents.map((d) => documentPath(this.organisationId, estimate.id, d.id)));
    }
    this.emit({ estimates: this.snapshot.estimates.filter((e) => e.id !== estimate.id) });
  }

  // ---------------------------------------------------------------------------
  // Documents (Supabase Storage, private bucket; path starts with the organisation id)

  async putDocument(estimateId: string, doc: DocumentRef, file: Blob) {
    const { error } = await this.db.storage
      .from(DOCUMENTS_BUCKET)
      .upload(documentPath(this.organisationId, estimateId, doc.id), file, { contentType: "application/pdf", upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    this.files.set(doc.id, file);
  }

  async getDocumentFile(estimateId: string, documentId: string) {
    const cached = this.files.get(documentId);
    if (cached) return cached;
    const { data, error } = await this.db.storage.from(DOCUMENTS_BUCKET).download(documentPath(this.organisationId, estimateId, documentId));
    if (error || !data) return null;
    this.files.set(documentId, data);
    return data;
  }

  async removeDocumentFile(estimateId: string, documentId: string) {
    this.files.delete(documentId);
    await this.db.storage.from(DOCUMENTS_BUCKET).remove([documentPath(this.organisationId, estimateId, documentId)]);
  }

  // ---------------------------------------------------------------------------
  // Approval and quotations: recorded by the server after it recalculates totals

  async approve(estimate: Estimate, input: ApprovalInput) {
    await this.flush(estimate.id);
    try {
      await postJson(`/api/estimates/${estimate.id}/approve`, input);
    } finally {
      await this.refreshEstimate(estimate.id);
    }
  }

  async issueQuotation(estimate: Estimate, versionId: string) {
    const result = await postJson<{ record: unknown; document: QuotationDocument }>(`/api/estimates/${estimate.id}/quotations`, { versionId });
    const record = QuotationRecordSchema.parse(result.record);
    await this.refreshEstimate(estimate.id);
    return { record, document: result.document };
  }

  // ---------------------------------------------------------------------------
  // Catalogue (administrators; enforced by RLS) and settings

  private async reloadCatalogue() {
    const { data, error } = await this.db.rpc("load_catalogue");
    if (error) throw new Error(friendlyDbError(error));
    this.emit({ catalogue: parseList(data, CatalogueItemSchema, "Catalogue item", []) });
  }

  private rateRow(itemId: string, rate: CatalogueRate) {
    return {
      id: rate.id,
      organisation_id: this.organisationId,
      catalogue_item_id: itemId,
      rate: rate.rate,
      currency: rate.currency,
      verification: rate.verification,
      source: rate.source,
      effective_from: rate.effectiveFrom,
      recorded_by: this.snapshot.context?.userId ?? null,
    };
  }

  async addCatalogueItem(item: CatalogueItem) {
    const valid = CatalogueItemSchema.parse(item);
    const { error } = await this.db.from("catalogue_items").insert({
      id: valid.id,
      organisation_id: this.organisationId,
      name: valid.name,
      category: valid.category,
      unit: valid.unit,
      cost_type: valid.costType,
      supplier: valid.supplier,
      notes: valid.notes,
      active: valid.active,
      thickness_mm: valid.specs.thicknessMm,
      sheet_length_mm: valid.specs.sheetLengthMm,
      sheet_width_mm: valid.specs.sheetWidthMm,
    });
    if (error) throw new Error(friendlyDbError(error));
    if (valid.rates.length > 0) {
      const rates = await this.db.from("catalogue_rates").insert(valid.rates.map((r) => this.rateRow(valid.id, r)));
      if (rates.error) throw new Error(friendlyDbError(rates.error));
    }
    await this.reloadCatalogue();
  }

  async addCatalogueRate(itemId: string, rate: CatalogueRate) {
    const { error } = await this.db.from("catalogue_rates").insert(this.rateRow(itemId, rate));
    if (error) throw new Error(friendlyDbError(error));
    await this.reloadCatalogue();
  }

  async setCatalogueItemActive(itemId: string, active: boolean) {
    const { error } = await this.db.from("catalogue_items").update({ active }).eq("id", itemId);
    if (error) throw new Error(friendlyDbError(error));
    await this.reloadCatalogue();
  }

  async saveSettings(settings: CompanySettings) {
    const valid = CompanySettingsSchema.parse(settings);
    const { error } = await this.db.from("company_settings").upsert(settingsToRow(this.organisationId, valid));
    if (error) throw new Error(friendlyDbError(error));
    this.emit({ settings: valid, loadErrors: this.snapshot.loadErrors.filter((e) => !e.startsWith("Company settings")) });
  }
}
