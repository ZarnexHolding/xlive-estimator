import { JobDispatchSchema, runAnalysisJob, WORKER_KEY_HEADER, workerFromEnv, workerKeyMatches } from "../../src/lib/server/analysis-job";

/**
 * Netlify Background Function: runs one AI analysis job, for up to 15 minutes (available on the
 * Free plan). Netlify answers the caller with 202 at once; the outcome is recorded in the job row.
 * Invoked only by /api/analysis-jobs, which presents the server key; anything else is ignored.
 */
export default async function analysisJob(request: Request): Promise<void> {
  const worker = workerFromEnv();
  if (!worker) {
    console.error("[analysis-job] not configured: ANTHROPIC_API_KEY, ESTIMATOR_SERVER_KEY and the Supabase variables are required");
    return;
  }
  if (!workerKeyMatches(request.headers.get(WORKER_KEY_HEADER), worker.serverKey)) {
    console.warn("[analysis-job] ignored an invocation without a valid key");
    return;
  }
  const dispatch = JobDispatchSchema.safeParse(await request.json().catch(() => null));
  if (!dispatch.success) {
    console.warn("[analysis-job] ignored an invalid request body");
    return;
  }
  await runAnalysisJob(dispatch.data, worker);
}

export const config = { background: true };
