import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ClaudeDocumentAnalysisProvider } from "@/ai/anthropic-provider";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from "@/ai/prompt";
import { AnalysisError, type AnalysisInput, type AnalysisOutput } from "@/ai/provider";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { anthropicConfig, MAX_PDF_BYTES, serverKey } from "./config";

/**
 * Background AI analysis jobs (see supabase/migrations/20261030000000_analysis_jobs.sql).
 *
 * /api/analysis-jobs creates a job for the signed-in editor and dispatches it. The worker below
 * claims it, downloads the PDF through a short-lived signed URL, runs the analysis and records the
 * validated result. It runs in a Netlify Background Function (up to 15 minutes) or, in development
 * and self-hosting, in the app process after the response. Not marked "server-only" because the
 * Netlify function imports it outside Next.js; only server code may import it.
 */

/** Fingerprint of the extraction prompt: stored results are reused only for the same prompt. */
export const PROMPT_ID = createHash("sha256").update(EXTRACTION_SYSTEM_PROMPT).update(EXTRACTION_USER_PROMPT).digest("hex").slice(0, 12);

/** Path of the Netlify Background Function (netlify/functions/analysis-job.mts). */
export const BACKGROUND_FUNCTION_PATH = "/.netlify/functions/analysis-job";
export const WORKER_KEY_HEADER = "x-estimator-key";

/** Two attempts at most, so the worker finishes inside the 15-minute background function limit. */
const ATTEMPT_TIMEOUT_MS = 6.5 * 60 * 1000;

export const JobDispatchSchema = z.object({ jobId: z.uuid(), pdfUrl: z.url() });
export type JobDispatch = z.infer<typeof JobDispatchSchema>;

const ClaimedJobSchema = z.object({ fileName: z.string(), pageCount: z.number().int().positive().nullable(), sha256: z.string() });

type RpcResult = { data: unknown; error: { message: string } | null };

export interface JobWorker {
  serverKey: string;
  call(fn: "claim_analysis_job" | "finish_analysis_job", args: Record<string, unknown>): Promise<RpcResult>;
  fetchPdf(url: string): Promise<Uint8Array>;
  analyse(input: AnalysisInput): Promise<AnalysisOutput>;
}

/** The production worker, configured from the environment; null when something is missing. */
export function workerFromEnv(): JobWorker | null {
  const ai = anthropicConfig();
  const key = serverKey();
  if (!ai || !key || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;
  const provider = new ClaudeDocumentAnalysisProvider(ai.apiKey, ai.model, { timeoutMs: ATTEMPT_TIMEOUT_MS, maxRetries: 1 });
  // No user session here: the job functions check the server key instead.
  const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    serverKey: key,
    call: async (fn, args) => {
      const { data, error } = await db.rpc(fn, args);
      return { data, error };
    },
    fetchPdf: downloadStoredPdf,
    analyse: (input) => provider.analyse(input),
  };
}

async function downloadStoredPdf(url: string): Promise<Uint8Array> {
  // Only signed Storage URLs of this project, never an arbitrary address.
  if (!url.startsWith(`${SUPABASE_URL}/storage/v1/object/sign/`)) throw new AnalysisError("invalid_file", "Unexpected document location.");
  const response = await fetch(url);
  if (!response.ok) throw new AnalysisError("invalid_file", "The stored PDF could not be read.");
  if (Number(response.headers.get("content-length") ?? 0) > MAX_PDF_BYTES) throw new AnalysisError("file_too_large", "The PDF exceeds the size limit.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_PDF_BYTES) throw new AnalysisError("file_too_large", "The PDF exceeds the size limit.");
  return bytes;
}

/** Constant-time check of the key presented to the background function. */
export function workerKeyMatches(presented: string | null, expected: string): boolean {
  if (!presented) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(presented), digest(expected));
}

/** Hands a job to the Netlify Background Function, which answers 202 at once and runs on its own. */
export async function invokeBackgroundWorker(origin: string, key: string, dispatch: JobDispatch): Promise<boolean> {
  try {
    const response = await fetch(new URL(BACKGROUND_FUNCTION_PATH, origin), {
      method: "POST",
      headers: { "content-type": "application/json", [WORKER_KEY_HEADER]: key },
      body: JSON.stringify(dispatch),
    });
    return response.status === 202;
  } catch {
    return false;
  }
}

/**
 * Runs one job and records its outcome. Never throws: on Netlify a failed invocation is retried,
 * and the claim makes a retry a no-op, so every outcome is recorded here instead.
 */
export async function runAnalysisJob(dispatch: JobDispatch, worker: JobWorker): Promise<"completed" | "skipped"> {
  const tag = `[analysis-job] ${dispatch.jobId}`;
  try {
    const claim = await worker.call("claim_analysis_job", { p_server_key: worker.serverKey, p_job_id: dispatch.jobId });
    if (claim.error) {
      console.error(`${tag} claim failed: ${claim.error.message}`);
      return "skipped";
    }
    // null: the job is not queued (already claimed, finished or unknown).
    const job = ClaimedJobSchema.safeParse(claim.data);
    if (!job.success) return "skipped";

    let finish: Record<string, unknown>;
    try {
      const pdf = await worker.fetchPdf(dispatch.pdfUrl);
      if (pdf.length < 5 || new TextDecoder().decode(pdf.subarray(0, 5)) !== "%PDF-") throw new AnalysisError("invalid_file", "The file is not a PDF.");
      if (createHash("sha256").update(pdf).digest("hex") !== job.data.sha256) {
        throw new AnalysisError("invalid_file", "The stored file does not match the document record.");
      }
      const output = await worker.analyse({ pdf, fileName: job.data.fileName.slice(0, 200), pageCount: job.data.pageCount });
      finish = {
        p_output: { result: output.result, model: output.model, warnings: output.warnings },
        p_error_code: null,
        p_error_message: null,
        p_retryable: false,
        p_input_tokens: output.usage.inputTokens,
        p_output_tokens: output.usage.outputTokens,
      };
    } catch (error) {
      const failure = error instanceof AnalysisError ? error : new AnalysisError("upstream", "Unexpected error while analysing the document.");
      // The code and message only: never the document, the key or upstream payloads.
      console.error(`${tag} ${failure.code}: ${failure.message}`);
      finish = { p_output: null, p_error_code: failure.code, p_error_message: failure.message, p_retryable: failure.retryable, p_input_tokens: null, p_output_tokens: null };
    }

    const recorded = await worker.call("finish_analysis_job", { p_server_key: worker.serverKey, p_job_id: dispatch.jobId, ...finish });
    if (recorded.error) console.error(`${tag} could not record the outcome: ${recorded.error.message}`);
    return "completed";
  } catch (error) {
    console.error(`${tag} worker error: ${error instanceof Error ? error.message : "unknown"}`);
    return "skipped";
  }
}
