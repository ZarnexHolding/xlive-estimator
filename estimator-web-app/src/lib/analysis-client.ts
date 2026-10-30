"use client";

import { z } from "zod";
import { ExtractionResultSchema, type ExtractionResult } from "@/ai/extraction-schema";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const ErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean(), retryAfterSeconds: z.number().nullable() }),
});

function failure(body: unknown, status: number) {
  const err = ErrorSchema.safeParse(body);
  return err.success
    ? { ok: false as const, message: err.data.error.message, retryable: err.data.error.retryable }
    : { ok: false as const, message: `Analysis failed (HTTP ${status}).`, retryable: status >= 500 };
}

/** What an analysis produced, validated again in the browser before anything is stored. */
export interface AnalysisResult {
  result: ExtractionResult;
  model: string;
  warnings: string[];
}
const AnalysisResultSchema = z.object({ result: ExtractionResultSchema, model: z.string(), warnings: z.array(z.string()) });

// ---------------------------------------------------------------------------
// Demo mode: the browser uploads the PDF and waits for the result.

const SuccessSchema = AnalysisResultSchema.extend({ sha256: z.string(), cached: z.boolean(), provider: z.literal("anthropic") });

export type AnalysisResponse = ({ ok: true; cached: boolean } & AnalysisResult) | { ok: false; message: string; retryable: boolean };

export async function requestAnalysis(file: Blob, fileName: string, pageCount: number | null, force: boolean): Promise<AnalysisResponse> {
  const form = new FormData();
  form.append("file", file, fileName);
  if (pageCount) form.append("pageCount", String(pageCount));
  if (force) form.append("force", "1");
  let response: Response;
  try {
    response = await fetch("/api/analyse", { method: "POST", body: form });
  } catch {
    return { ok: false, message: "Network error: the server could not be reached.", retryable: true };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) return failure(body, response.status);
  const parsed = SuccessSchema.safeParse(body);
  if (!parsed.success) return { ok: false, message: "The server returned an unexpected response. Nothing was stored.", retryable: false };
  return { ok: true, result: parsed.data.result, model: parsed.data.model, warnings: parsed.data.warnings, cached: parsed.data.cached };
}

// ---------------------------------------------------------------------------
// Connected mode: the analysis runs as a background job; the browser polls the job row.

/** The worker stops after 15 minutes; a job unfinished well past that will not finish. */
export const JOB_STALE_AFTER_MS = 17 * 60 * 1000;

export async function startAnalysisJob(input: { jobId: string; estimateId: string; documentId: string; force: boolean }): Promise<
  { ok: true; status: "queued" | "succeeded" } | { ok: false; message: string; retryable: boolean }
> {
  let response: Response;
  try {
    response = await fetch("/api/analysis-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  } catch {
    return { ok: false, message: "Network error: the server could not be reached.", retryable: true };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) return failure(body, response.status);
  const parsed = z.object({ status: z.enum(["queued", "succeeded"]) }).safeParse(body);
  return parsed.success ? { ok: true, status: parsed.data.status } : { ok: false, message: "The server returned an unexpected response.", retryable: true };
}

export type JobState =
  | { status: "missing" }
  | { status: "pending"; createdAt: string }
  | ({ status: "succeeded"; reused: boolean } & AnalysisResult)
  | { status: "failed"; message: string };

const JobRowSchema = z.object({
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  output: z.unknown(),
  error_message: z.string().nullable(),
  reused: z.boolean(),
  created_at: z.string(),
});

/** Reads a job (Row Level Security limits this to the organisation). null: not readable right now. */
export async function readAnalysisJob(jobId: string): Promise<JobState | null> {
  const { data, error } = await getBrowserSupabase().from("analysis_jobs").select("status, output, error_message, reused, created_at").eq("id", jobId).maybeSingle();
  if (error) return null;
  if (!data) return { status: "missing" };
  const row = JobRowSchema.safeParse(data);
  if (!row.success) return null;
  switch (row.data.status) {
    case "queued":
    case "running":
      return { status: "pending", createdAt: row.data.created_at };
    case "failed":
      return { status: "failed", message: row.data.error_message ?? "The analysis failed." };
    case "succeeded": {
      const output = AnalysisResultSchema.safeParse(row.data.output);
      return output.success
        ? { status: "succeeded", reused: row.data.reused, ...output.data }
        : { status: "failed", message: "The stored analysis result failed validation. Nothing was imported." };
    }
  }
}
