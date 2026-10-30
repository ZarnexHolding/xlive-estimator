/**
 * Public Supabase configuration (safe for the browser: the publishable key only grants what
 * Row Level Security allows). When absent, the app runs in browser-only demo mode.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const isSupabaseConfigured = SUPABASE_URL !== "" && SUPABASE_PUBLISHABLE_KEY !== "";

export const DOCUMENTS_BUCKET = "project-documents";

/** Storage object path for an uploaded PDF; the first segment is checked by storage RLS. */
export function documentPath(organisationId: string, estimateId: string, documentId: string): string {
  return `${organisationId}/${estimateId}/${documentId}.pdf`;
}

/** Routes reachable without signing in. */
export const PUBLIC_PATHS = ["/login", "/auth"];

/** Where an emailed password reset link ends up, after /auth/confirm has signed the person in. */
export const RESET_PASSWORD_PATH = "/reset-password";
