/**
 * The background analysis worker, with the database and the AI service replaced by fakes:
 * claiming, file integrity checks, recording outcomes, and never throwing (a thrown error would
 * make Netlify retry the invocation).
 */
import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

// Read when the Supabase config module loads, so set before the imports below run.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
});

import { AnalysisError, type AnalysisOutput } from "@/ai/provider";
import { runAnalysisJob, WORKER_KEY_HEADER, workerKeyMatches, type JobWorker } from "@/lib/server/analysis-job";
import analysisJobFunction from "../netlify/functions/analysis-job.mjs";

const pdf = new TextEncoder().encode("%PDF-1.7 test drawing");
const sha = createHash("sha256").update(pdf).digest("hex");
const output: AnalysisOutput = {
  result: { measurements: [] } as unknown as AnalysisOutput["result"],
  provider: "anthropic",
  model: "claude-opus-5-5",
  warnings: ["note"],
  usage: { inputTokens: 1200, outputTokens: 3400 },
};

function fakeWorker(overrides: Partial<JobWorker> & { claim?: unknown } = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const worker: JobWorker = {
    serverKey: "key-1",
    call: async (fn, args) => {
      calls.push({ fn, args });
      return { data: fn === "claim_analysis_job" ? ("claim" in overrides ? overrides.claim : { fileName: "Booth.pdf", pageCount: 4, sha256: sha }) : true, error: null };
    },
    fetchPdf: async () => pdf,
    analyse: vi.fn(async () => output),
    ...overrides,
  };
  const finish = () => calls.find((c) => c.fn === "finish_analysis_job")?.args;
  return { worker, calls, finish };
}

const dispatch = { jobId: randomUUID(), pdfUrl: "https://example.supabase.co/storage/v1/object/sign/x.pdf?token=t" };

describe("runAnalysisJob", () => {
  it("claims the job, analyses the verified file and records the result with token usage", async () => {
    const { worker, calls, finish } = fakeWorker();
    expect(await runAnalysisJob(dispatch, worker)).toBe("completed");
    expect(calls.map((c) => c.fn)).toEqual(["claim_analysis_job", "finish_analysis_job"]);
    expect(worker.analyse).toHaveBeenCalledWith({ pdf, fileName: "Booth.pdf", pageCount: 4 });
    expect(finish()).toMatchObject({
      p_server_key: "key-1",
      p_job_id: dispatch.jobId,
      p_output: { result: output.result, model: "claude-opus-5-5", warnings: ["note"] },
      p_error_code: null,
      p_input_tokens: 1200,
      p_output_tokens: 3400,
    });
  });

  it("does nothing when the job is not queued (a retried or duplicate invocation)", async () => {
    const { worker, calls } = fakeWorker({ claim: null });
    expect(await runAnalysisJob(dispatch, worker)).toBe("skipped");
    expect(worker.analyse).not.toHaveBeenCalled();
    expect(calls.map((c) => c.fn)).toEqual(["claim_analysis_job"]);
  });

  it("refuses a file that does not match the document record, without calling the AI service", async () => {
    const { worker, finish } = fakeWorker({ fetchPdf: async () => new TextEncoder().encode("%PDF-1.7 a different file") });
    await runAnalysisJob(dispatch, worker);
    expect(worker.analyse).not.toHaveBeenCalled();
    expect(finish()).toMatchObject({ p_output: null, p_error_code: "invalid_file", p_retryable: false });
  });

  it("records AI service errors with their retry hint", async () => {
    const { worker, finish } = fakeWorker({ analyse: vi.fn(async () => Promise.reject(new AnalysisError("rate_limited", "The AI service is rate-limited. Wait and retry."))) });
    expect(await runAnalysisJob(dispatch, worker)).toBe("completed");
    expect(finish()).toMatchObject({ p_output: null, p_error_code: "rate_limited", p_error_message: "The AI service is rate-limited. Wait and retry.", p_retryable: true });
  });

  it("never throws, even when the database is unreachable", async () => {
    const { worker } = fakeWorker({ call: async () => Promise.reject(new Error("fetch failed")) });
    await expect(runAnalysisJob(dispatch, worker)).resolves.toBe("skipped");
  });
});

describe("background function entry point", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("compares keys in constant time and rejects missing or wrong keys", () => {
    expect(workerKeyMatches("key-1", "key-1")).toBe(true);
    expect(workerKeyMatches("key-2", "key-1")).toBe(false);
    expect(workerKeyMatches(null, "key-1")).toBe(false);
  });

  it("ignores invocations without the server key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test");
    vi.stubEnv("ESTIMATOR_SERVER_KEY", "key-1");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const request = (key: string | null) =>
      new Request("https://site.example/.netlify/functions/analysis-job", {
        method: "POST",
        headers: key ? { [WORKER_KEY_HEADER]: key } : {},
        body: JSON.stringify(dispatch),
      });
    await analysisJobFunction(request(null));
    await analysisJobFunction(request("wrong"));
    expect(warn.mock.calls.map((c) => c[0])).toEqual(Array(2).fill("[analysis-job] ignored an invocation without a valid key"));
    expect(fetchSpy).not.toHaveBeenCalled(); // neither the database nor the AI service was contacted
    fetchSpy.mockRestore();
    warn.mockRestore();
  });
});
