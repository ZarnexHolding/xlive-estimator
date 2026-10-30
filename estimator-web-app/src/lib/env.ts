import "server-only";
import { anthropicConfig, MAX_PDF_BYTES, serverKey } from "./server/config";
import { isSupabaseConfigured } from "./supabase/config";

/** Server-side configuration. Secrets are read on the server only and never sent to the browser. */

export { anthropicConfig, DEFAULT_ANTHROPIC_MODEL, MAX_PDF_BYTES, serverKey } from "./server/config";

/**
 * Who may call the paid AI endpoint. With Supabase configured, only signed-in members who can
 * edit (checked in the route). In demo mode there is no sign-in, so it is allowed in local
 * development and must be enabled explicitly in production on a private deployment.
 */
export function unauthenticatedAnalysisAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_UNAUTHENTICATED_ANALYSIS === "true";
}

export interface SystemStatus {
  /** Where estimates are persisted in this build. */
  persistence: "supabase" | "browser_demo";
  supabaseConfigured: boolean;
  serverKeyConfigured: boolean;
  ai: { configured: boolean; enabled: boolean; provider: "anthropic"; model: string | null };
  maxPdfBytes: number;
}

export function systemStatus(): SystemStatus {
  const ai = anthropicConfig();
  return {
    persistence: isSupabaseConfigured ? "supabase" : "browser_demo",
    supabaseConfigured: isSupabaseConfigured,
    serverKeyConfigured: serverKey() !== null,
    ai: {
      configured: ai !== null,
      enabled: ai !== null && (isSupabaseConfigured || unauthenticatedAnalysisAllowed()),
      provider: "anthropic",
      model: ai?.model ?? null,
    },
    maxPdfBytes: MAX_PDF_BYTES,
  };
}
