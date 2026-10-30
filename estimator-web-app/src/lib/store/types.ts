import { z } from "zod";
import type { CatalogueItem, CatalogueRate } from "@/domain/catalogue";
import type { Estimate, QuotationRecord } from "@/domain/estimate";
import type { QuotationDocument } from "@/domain/quotation";
import type { DocumentRef } from "@/domain/schemas";
import type { CompanySettings } from "@/domain/settings";

export const AppContextSchema = z.object({
  userId: z.string(),
  email: z.string().nullable(),
  fullName: z.string().nullable(),
  role: z.enum(["admin", "estimator", "viewer"]).nullable(),
  organisationId: z.string().nullable(),
  organisationName: z.string().nullable(),
  organisationsExist: z.boolean(),
});
export type AppContext = z.infer<typeof AppContextSchema>;

export interface StoreSnapshot {
  mode: "demo" | "supabase";
  ready: boolean;
  /** Signed-in user and organisation (connected mode only). */
  context: AppContext | null;
  estimates: Estimate[];
  catalogue: CatalogueItem[];
  settings: CompanySettings;
  loadErrors: string[];
}

export interface ApprovalInput {
  approvedBy: string;
  note: string;
  acknowledgeWarnings: boolean;
}

/**
 * Persistence for the UI. Two implementations: the browser-only demo store and the
 * Supabase store. Components depend on this interface, never on a specific backend.
 */
export interface AppStore {
  readonly mode: "demo" | "supabase";
  subscribe(listener: () => void): () => void;
  getSnapshot(): StoreSnapshot;
  getServerSnapshot(): StoreSnapshot;
  load(): void;
  reload(): Promise<void>;

  /** Validates synchronously (throws on invalid data), updates the UI at once, persists in the background. */
  saveEstimate(estimate: Estimate): Promise<void>;
  /** Resolves once every queued save of this estimate has been stored. */
  whenSaved(estimateId: string): Promise<void>;
  deleteEstimate(estimate: Estimate): Promise<void>;

  putDocument(estimateId: string, doc: DocumentRef, file: Blob): Promise<void>;
  getDocumentFile(estimateId: string, documentId: string): Promise<Blob | null>;
  removeDocumentFile(estimateId: string, documentId: string): Promise<void>;

  /** Approval is recorded where totals cannot be tampered with (the server, in connected mode). */
  approve(estimate: Estimate, input: ApprovalInput): Promise<void>;
  issueQuotation(estimate: Estimate, versionId: string): Promise<{ record: QuotationRecord; document: QuotationDocument }>;

  addCatalogueItem(item: CatalogueItem): Promise<void>;
  addCatalogueRate(itemId: string, rate: CatalogueRate): Promise<void>;
  setCatalogueItemActive(itemId: string, active: boolean): Promise<void>;
  saveSettings(settings: CompanySettings): Promise<void>;
}
