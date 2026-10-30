import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DemoStore } from "./demo-store";
import { SupabaseStore } from "./supabase-store";
import type { AppStore } from "./types";

/** The single store the UI uses: Supabase when configured, otherwise the browser demo store. */
export const appStore: AppStore = isSupabaseConfigured ? new SupabaseStore() : new DemoStore();

export { DemoStore, nextQuotationNumber } from "./demo-store";
export type { AppContext, AppStore, ApprovalInput, StoreSnapshot } from "./types";
