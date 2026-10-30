import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { checkExtractionBounds, ExtractionResultSchema } from "./extraction-schema";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from "./prompt";
import { AnalysisError, type AnalysisInput, type AnalysisOutput, type DocumentAnalysisProvider } from "./provider";

/**
 * Claude implementation of document analysis. The PDF is sent as a document block, so
 * Claude sees each page as an image as well as its text layer, which matters for
 * image-only drawings.
 *
 * Server code only: the API key is passed in by the caller and never bundled for the browser.
 */
export class ClaudeDocumentAnalysisProvider implements DocumentAnalysisProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
    // The SDK retries 408/409/429/5xx and connection errors with backoff. Callers with a hard
    // time limit (the background worker) lower these so all attempts fit inside it.
    options: { timeoutMs?: number; maxRetries?: number } = {},
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: options.maxRetries ?? 2, timeout: options.timeoutMs ?? 8 * 60 * 1000 });
  }

  async analyse(input: AnalysisInput): Promise<AnalysisOutput> {
    const data = Buffer.from(input.pdf).toString("base64");
    let response;
    try {
      // Streamed so the connection carries data during a multi-minute analysis instead of
      // sitting idle, which proxies and serverless networks may drop.
      const stream = this.client.beta.messages.stream({
        model: this.model,
        max_tokens: 32000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high", format: betaZodOutputFormat(ExtractionResultSchema) },
        // Retry on a substitute model if the requested model declines for policy reasons.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data }, title: input.fileName },
              { type: "text", text: EXTRACTION_USER_PROMPT },
            ],
          },
        ],
      });
      response = await stream.finalMessage();
    } catch (error) {
      throw toAnalysisError(error);
    }
    // Server log only: token usage is the basis for cost tracking. No document content is logged.
    console.info(
      `[analyse] ${response.model} stop=${response.stop_reason} input_tokens=${response.usage.input_tokens} output_tokens=${response.usage.output_tokens}`,
    );

    if (response.stop_reason === "refusal") {
      throw new AnalysisError("refused", "The model declined to analyse this document.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new AnalysisError("invalid_output", "The analysis was cut off before it finished. Try a smaller document or split it.");
    }
    // Never trust the parsed output blindly: validate again with our own schema.
    const parsed = ExtractionResultSchema.safeParse(response.parsed_output);
    if (!parsed.success) {
      throw new AnalysisError("invalid_output", "The model returned data that failed validation. No results were stored.");
    }
    return {
      result: parsed.data,
      provider: "anthropic",
      model: response.model,
      warnings: checkExtractionBounds(parsed.data, input.pageCount),
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    };
  }
}

function toAnalysisError(error: unknown): AnalysisError {
  if (error instanceof AnalysisError) return error;
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AnalysisError("timeout", "The analysis timed out. You can retry.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    const retryAfter = Number(error.headers?.get("retry-after"));
    return new AnalysisError("rate_limited", "The AI service is rate-limited. Wait and retry.", Number.isFinite(retryAfter) ? retryAfter : null);
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AnalysisError("not_configured", "The AI service rejected the configured API key.");
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AnalysisError("invalid_file", "The AI service could not process this PDF (it may be too large, encrypted or malformed).");
  }
  if (error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionError) {
    return new AnalysisError("upstream", "The AI service is temporarily unavailable. You can retry.");
  }
  if (error instanceof Anthropic.APIError) {
    return new AnalysisError("upstream", `The AI service returned an error (${error.status ?? "no status"}).`);
  }
  return new AnalysisError("upstream", "Unexpected error while analysing the document.");
}
