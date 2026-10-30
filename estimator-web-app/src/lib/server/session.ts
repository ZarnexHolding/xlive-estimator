import "server-only";
import { AppContextSchema, type AppContext } from "@/lib/store/types";
import { getServerSupabase } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof getServerSupabase>>;

export function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message, retryable: status >= 500, retryAfterSeconds: null } }, { status });
}

/**
 * The signed-in user acting on this request (their session, so Row Level Security applies),
 * required to belong to an organisation with permission to edit.
 */
export async function requireEditor(): Promise<{ supabase: Supabase; context: AppContext & { organisationId: string } } | Response> {
  const supabase = await getServerSupabase();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return jsonError(401, "unauthenticated", "Sign in to continue.");
  const { data, error } = await supabase.rpc("get_app_context");
  const context = AppContextSchema.safeParse(data);
  if (error || !context.success || !context.data.organisationId) return jsonError(403, "no_organisation", "Your account is not a member of an organisation.");
  if (context.data.role !== "admin" && context.data.role !== "estimator") return jsonError(403, "read_only", "Your role is read-only.");
  return { supabase, context: { ...context.data, organisationId: context.data.organisationId } };
}
