import { randomUUID } from "node:crypto";
import { z } from "zod";
import { EstimateSchema } from "@/domain/estimate";
import { ApprovalError, approveEstimate } from "@/domain/versioning";
import { serverKey } from "@/lib/env";
import { jsonError, requireEditor } from "@/lib/server/session";
import { friendlyDbError } from "@/lib/supabase/mappers";

const BodySchema = z.object({ approvedBy: z.string().trim().min(1), note: z.string().max(2000), acknowledgeWarnings: z.boolean() });

/**
 * Approve the stored estimate. The server loads it from the database (not from the request),
 * recalculates it with the costing engine, and records the immutable version with the server key.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/estimates/[id]/approve">) {
  const key = serverKey();
  if (!key) return jsonError(503, "not_configured", "Approvals are disabled: ESTIMATOR_SERVER_KEY is not configured on the server.");
  const session = await requireEditor();
  if (session instanceof Response) return session;
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "invalid_request", "Approver name, note and warning acknowledgement are required.");

  const { id } = await ctx.params;
  const { data, error } = await session.supabase.rpc("load_estimates", { p_id: id });
  if (error) return jsonError(500, "load_failed", friendlyDbError(error));
  const stored = Array.isArray(data) ? EstimateSchema.safeParse(data[0]) : null;
  if (!stored?.success) return jsonError(404, "not_found", "Estimate not found.");

  let approved;
  try {
    approved = approveEstimate(stored.data, { versionId: randomUUID(), at: new Date().toISOString(), ...body.data });
  } catch (e) {
    if (e instanceof ApprovalError) {
      return Response.json({ error: { code: "not_ready", message: e.message, retryable: false, retryAfterSeconds: null }, issues: e.issues }, { status: 422 });
    }
    throw e;
  }
  const version = approved.versions.at(-1)!;
  const recorded = await session.supabase.rpc("record_approved_version", { p_server_key: key, p_estimate_id: id, p_version: version });
  if (recorded.error) {
    const status = recorded.error.code === "40001" ? 409 : recorded.error.code === "42501" ? 403 : 500;
    return jsonError(status, "record_failed", friendlyDbError(recorded.error));
  }
  return Response.json({ versionId: version.id, versionNo: version.versionNo, sellingPriceExVat: version.calculation.sellingPriceExVat });
}
