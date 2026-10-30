import { z } from "zod";
import { EstimateSchema, type QuotationRecord } from "@/domain/estimate";
import { buildQuotation, QuotationError } from "@/domain/quotation";
import { serverKey } from "@/lib/env";
import { jsonError, requireEditor } from "@/lib/server/session";
import { friendlyDbError, settingsFromRow, type CompanySettingsRow } from "@/lib/supabase/mappers";

const BodySchema = z.object({ versionId: z.uuid() });
const RecordedSchema = z.object({ id: z.string(), number: z.string(), createdAt: z.string() });

/**
 * Issue a quotation from an approved version. The total comes from the stored, immutable version;
 * the database allocates the sequential number and re-checks the total against the version.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/estimates/[id]/quotations">) {
  const key = serverKey();
  if (!key) return jsonError(503, "not_configured", "Quotations are disabled: ESTIMATOR_SERVER_KEY is not configured on the server.");
  const session = await requireEditor();
  if (session instanceof Response) return session;
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "invalid_request", "An approved version id is required.");

  const { id } = await ctx.params;
  const [estimateResult, settingsResult] = await Promise.all([
    session.supabase.rpc("load_estimates", { p_id: id }),
    session.supabase.from("company_settings").select("*").maybeSingle<CompanySettingsRow>(),
  ]);
  if (estimateResult.error) return jsonError(500, "load_failed", friendlyDbError(estimateResult.error));
  const estimate = Array.isArray(estimateResult.data) ? EstimateSchema.safeParse(estimateResult.data[0]) : null;
  if (!estimate?.success) return jsonError(404, "not_found", "Estimate not found.");
  const version = estimate.data.versions.find((v) => v.id === body.data.versionId);
  if (!version) return jsonError(404, "not_found", "Approved version not found.");
  const { settings, valid } = settingsFromRow(settingsResult.data ?? null);
  if (!valid) return jsonError(409, "settings_incomplete", "Company settings are incomplete. An administrator must save them before quotations can be issued.");

  const issueDate = new Date().toISOString().slice(0, 10);
  let draft;
  try {
    draft = buildQuotation(version, settings, { number: "PENDING", issueDate });
  } catch (e) {
    if (e instanceof QuotationError) return jsonError(422, "not_quotable", e.message);
    throw e;
  }
  const recorded = await session.supabase.rpc("record_quotation", {
    p_server_key: key,
    p_version_id: version.id,
    p_issue_date: issueDate,
    p_valid_until: draft.validUntil,
    p_total_ex_vat: draft.totalExVat,
    p_settings: settings,
  });
  if (recorded.error) return jsonError(recorded.error.code === "42501" ? 403 : 500, "record_failed", friendlyDbError(recorded.error));
  const { id: quotationId, number, createdAt } = RecordedSchema.parse(recorded.data);

  const document = { ...draft, number };
  const record: QuotationRecord = {
    id: quotationId,
    number,
    versionId: version.id,
    versionNo: version.versionNo,
    issueDate,
    validUntil: document.validUntil,
    totalExVat: document.totalExVat,
    currency: document.currency,
    vatTreatment: "excluded",
    format: "summary",
    settingsSnapshot: settings,
    createdAt,
  };
  return Response.json({ record, document });
}
