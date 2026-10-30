import type { ExtractionResult } from "./extraction-schema";

export type AnalysisErrorCode =
  | "not_configured"
  | "invalid_file"
  | "file_too_large"
  | "rate_limited"
  | "timeout"
  | "upstream"
  | "refused"
  | "invalid_output";

const RETRYABLE: ReadonlySet<AnalysisErrorCode> = new Set(["rate_limited", "timeout", "upstream"]);

/** Errors safe to show to the user: no secrets, no raw upstream payloads. */
export class AnalysisError extends Error {
  readonly retryable: boolean;
  constructor(
    readonly code: AnalysisErrorCode,
    message: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "AnalysisError";
    this.retryable = RETRYABLE.has(code);
  }
}

export interface AnalysisInput {
  pdf: Uint8Array;
  fileName: string;
  pageCount: number | null;
}

export interface AnalysisOutput {
  result: ExtractionResult;
  provider: "anthropic";
  model: string;
  /** Problems found by post-validation checks; reported to the estimator, not hidden. */
  warnings: string[];
  /** Billed tokens (output includes thinking), recorded for cost tracking. */
  usage: { inputTokens: number; outputTokens: number };
}

/** Provider-neutral interface so the underlying AI service can be swapped later. */
export interface DocumentAnalysisProvider {
  readonly name: string;
  readonly model: string;
  analyse(input: AnalysisInput): Promise<AnalysisOutput>;
}
