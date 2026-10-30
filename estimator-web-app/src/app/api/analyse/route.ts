import { createHash } from "node:crypto";
import { ClaudeDocumentAnalysisProvider } from "@/ai/anthropic-provider";
import { AnalysisError, type AnalysisOutput } from "@/ai/provider";
import { anthropicConfig, MAX_PDF_BYTES, unauthenticatedAnalysisAllowed } from "@/lib/env";
import { PROMPT_ID } from "@/lib/server/analysis-job";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Demo mode only (no database, local use): the browser uploads the PDF and waits for the result.
 * With Supabase configured, analysis runs as a background job instead (/api/analysis-jobs).
 */

// Drawing analysis can take several minutes.
export const maxDuration = 300;

/**
 * Results cached per document hash, model and prompt for the life of the server process, so a
 * repeated click does not resend an expensive document. Re-analysis requires force.
 */
const cache = new Map<string, AnalysisOutput>();
const inFlight = new Map<string, Promise<AnalysisOutput>>();

function errorResponse(error: AnalysisError, status: number) {
  return Response.json(
    { error: { code: error.code, message: error.message, retryable: error.retryable, retryAfterSeconds: error.retryAfterSeconds } },
    { status },
  );
}

const STATUS_BY_CODE: Record<AnalysisError["code"], number> = {
  not_configured: 503,
  invalid_file: 400,
  file_too_large: 413,
  rate_limited: 429,
  timeout: 504,
  upstream: 502,
  refused: 422,
  invalid_output: 502,
};

type Input = { bytes: Uint8Array; fileName: string; pageCount: number | null; force: boolean };

/** The browser uploads the PDF in the request (demo mode has no accounts). */
async function readUploadedFile(request: Request): Promise<Input | Response> {
  if (!unauthenticatedAnalysisAllowed()) {
    return errorResponse(new AnalysisError("not_configured", "AI analysis is disabled on this deployment until user authentication is enabled."), 403);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_PDF_BYTES + 1024 * 1024) {
    return errorResponse(new AnalysisError("file_too_large", `PDF exceeds the ${MAX_PDF_BYTES / 1024 / 1024} MB limit.`), 413);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(new AnalysisError("invalid_file", "Expected a multipart upload with a PDF file."), 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return errorResponse(new AnalysisError("invalid_file", "No file was uploaded."), 400);
  if (file.size > MAX_PDF_BYTES) return errorResponse(new AnalysisError("file_too_large", `PDF exceeds the ${MAX_PDF_BYTES / 1024 / 1024} MB limit.`), 413);
  const pageCountRaw = Number(form.get("pageCount"));
  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    fileName: file.name,
    pageCount: Number.isInteger(pageCountRaw) && pageCountRaw > 0 ? pageCountRaw : null,
    force: form.get("force") === "1",
  };
}

export async function POST(request: Request) {
  const config = anthropicConfig();
  if (!config) {
    return errorResponse(new AnalysisError("not_configured", "AI analysis is not configured on this server (ANTHROPIC_API_KEY is missing)."), 503);
  }
  if (isSupabaseConfigured) {
    return errorResponse(new AnalysisError("not_configured", "This deployment analyses stored documents as background jobs."), 404);
  }
  const input = await readUploadedFile(request);
  if (input instanceof Response) return input;
  const { bytes, fileName, pageCount, force } = input;

  // Check the content, not just the declared type.
  if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    return errorResponse(new AnalysisError("invalid_file", "The file is not a PDF."), 400);
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const key = `${config.model}:${PROMPT_ID}:${sha256}`;
  if (!force && cache.has(key)) {
    return Response.json({ sha256, cached: true, ...cache.get(key)! });
  }

  try {
    let pending = inFlight.get(key);
    if (!pending) {
      const provider = new ClaudeDocumentAnalysisProvider(config.apiKey, config.model);
      pending = provider.analyse({ pdf: bytes, fileName: fileName.slice(0, 200), pageCount });
      inFlight.set(key, pending);
    }
    const output = await pending;
    cache.set(key, output);
    return Response.json({ sha256, cached: false, ...output });
  } catch (error) {
    const analysisError = error instanceof AnalysisError ? error : new AnalysisError("upstream", "Unexpected error while analysing the document.");
    // Log the code only: never the document, the key or upstream payloads.
    console.error(`[analyse] ${analysisError.code}: ${analysisError.message}`);
    return errorResponse(analysisError, STATUS_BY_CODE[analysisError.code]);
  } finally {
    inFlight.delete(key);
  }
}
