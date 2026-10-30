import { after } from "next/server";
import { z } from "zod";
import { anthropicConfig, MAX_PDF_BYTES, serverKey } from "@/lib/env";
import { invokeBackgroundWorker, PROMPT_ID, runAnalysisJob, workerFromEnv, type JobDispatch } from "@/lib/server/analysis-job";
import { jsonError, requireEditor } from "@/lib/server/session";
import { friendlyDbError } from "@/lib/supabase/mappers";
import { DOCUMENTS_BUCKET, isSupabaseConfigured } from "@/lib/supabase/config";

const BodySchema = z.object({
  jobId: z.uuid(),
  estimateId: z.uuid(),
  documentId: z.uuid(),
  force: z.boolean(),
});

/** Long enough for a retried background invocation to download the file. */
const SIGNED_URL_SECONDS = 15 * 60;

/**
 * Start an AI analysis of a stored document (connected mode). Returns at once: the analysis
 * runs as a background job, and the browser polls the job row for the result.
 * 200 { status: "succeeded" } when an earlier result for the same file was reused (no AI call);
 * 202 { status: "queued" } otherwise.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured) return jsonError(404, "not_available", "Background analysis requires the database.");
  const ai = anthropicConfig();
  if (!ai) return jsonError(503, "not_configured", "AI analysis is not configured on this server (ANTHROPIC_API_KEY is missing).");
  const key = serverKey();
  const worker = workerFromEnv();
  if (!key || !worker) return jsonError(503, "not_configured", "AI analysis is disabled: ESTIMATOR_SERVER_KEY is not configured on the server.");
  const session = await requireEditor();
  if (session instanceof Response) return session;
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "invalid_request", "Expected a job id, an estimate id and a document id.");
  const { jobId, estimateId, documentId, force } = body.data;

  // RLS limits this to documents in the caller's organisation.
  const { data: doc } = await session.supabase
    .from("documents")
    .select("storage_path, size_bytes")
    .eq("id", documentId)
    .eq("project_id", estimateId)
    .maybeSingle<{ storage_path: string; size_bytes: number }>();
  if (!doc) return jsonError(404, "not_found", "Document not found. Save the estimate and try again.");
  if (doc.size_bytes > MAX_PDF_BYTES) return jsonError(413, "file_too_large", `PDF exceeds the ${MAX_PDF_BYTES / 1024 / 1024} MB limit.`);

  const created = await session.supabase.rpc("create_analysis_job", {
    p_server_key: key,
    p_job_id: jobId,
    p_estimate_id: estimateId,
    p_document_id: documentId,
    p_model: ai.model,
    p_prompt_id: PROMPT_ID,
    p_force: force,
  });
  if (created.error) {
    const status = created.error.code === "P0002" ? 404 : created.error.code === "42501" ? 403 : created.error.code === "23505" ? 409 : 500;
    return jsonError(status, "create_failed", friendlyDbError(created.error));
  }
  if (created.data === "succeeded") return Response.json({ status: "succeeded" });

  const fail = (message: string) =>
    session.supabase.rpc("finish_analysis_job", {
      p_server_key: key, p_job_id: jobId, p_output: null, p_error_code: "upstream", p_error_message: message, p_retryable: true, p_input_tokens: null, p_output_tokens: null,
    });

  // The worker has no user session, so it reads the file through a short-lived signed URL.
  const { data: signed } = await session.supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS);
  if (!signed?.signedUrl) {
    await fail("The stored PDF could not be read.");
    return jsonError(500, "storage_failed", "The stored PDF could not be read.");
  }
  const dispatch: JobDispatch = { jobId, pdfUrl: signed.signedUrl };

  // ANALYSIS_RUNNER is fixed at build time (next.config.ts): "netlify" on Netlify, otherwise
  // the job runs in this process after the response (development and self-hosting).
  if (process.env.ANALYSIS_RUNNER === "netlify") {
    if (!(await invokeBackgroundWorker(new URL(request.url).origin, key, dispatch))) {
      await fail("The analysis could not be started. Try again.");
      return jsonError(502, "dispatch_failed", "The analysis could not be started. Try again.");
    }
  } else {
    after(() => runAnalysisJob(dispatch, worker));
  }
  return Response.json({ status: "queued" }, { status: 202 });
}
