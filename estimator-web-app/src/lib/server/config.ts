/**
 * Secrets read from the server environment, shared by the Next.js server and the background
 * analysis worker (which runs outside Next.js, so this module is not marked "server-only";
 * only server code imports it). Never import it from a client component.
 */

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

/** Upload limit for design PDFs (base64 inflates by ~33 %; the Claude API request limit is 32 MB). */
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

export function anthropicConfig(): { apiKey: string; model: string } | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  return { apiKey, model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL };
}

/** Key the server presents to record approvals, quotations and analysis results (the database holds its hash). */
export function serverKey(): string | null {
  return process.env.ESTIMATOR_SERVER_KEY?.trim() || null;
}
