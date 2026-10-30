"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { Estimate } from "@/domain/estimate";
import { JOB_STALE_AFTER_MS, readAnalysisJob } from "@/lib/analysis-client";
import { failAnalysisRun, importAnalysisResult } from "@/lib/analysis-import";
import { appStore } from "@/lib/store";
import type { EstimateRecipe } from "@/lib/store/hooks";

const POLL_MS = 5000;
/** A run whose job never appeared (it was never created, or predates background jobs). */
const MISSING_AFTER_MS = 2 * 60 * 1000;

/**
 * Connected mode: AI analyses run as background jobs. While an estimate is open, on any step,
 * poll the job of each running analysis and import its result when it is ready. This also picks
 * up analyses that finished while the estimate was closed.
 */
export function useAnalysisJobs(
  estimate: Estimate | null,
  update: (recipe: EstimateRecipe, options?: { contentEdit?: boolean }) => boolean,
  onImported: () => void,
) {
  const estimateId = estimate?.id ?? "";
  const runningKey =
    appStore.mode === "supabase" && estimate
      ? estimate.analysisRuns.filter((r) => r.provider === "anthropic" && r.status === "running").map((r) => r.id).join(",")
      : "";
  const latest = useRef({ update, onImported });
  useEffect(() => {
    latest.current = { update, onImported };
  });

  useEffect(() => {
    if (!runningKey) return;
    let stopped = false;
    let busy = false;

    async function poll() {
      if (busy || stopped) return;
      busy = true;
      try {
        for (const runId of runningKey.split(",")) {
          const run = currentRun(estimateId, runId);
          if (!run || run.status !== "running") continue;
          const job = await readAnalysisJob(runId);
          if (stopped || !job) continue;
          const { update, onImported } = latest.current;
          const age = Date.now() - new Date(run.startedAt).getTime();
          if (job.status === "succeeded") {
            if (update(importAnalysisResult(runId, run.documentId, job))) {
              toast.success(`${job.result.measurements.length} measurements extracted${job.reused ? " (earlier result for the same file, no new AI call)" : ""}. Review them before use.`);
              onImported();
            }
          } else if (job.status === "failed") {
            update(failAnalysisRun(runId, job.message), { contentEdit: false });
            toast.error(job.message);
          } else if (job.status === "missing" ? age > MISSING_AFTER_MS : Date.now() - new Date(job.createdAt).getTime() > JOB_STALE_AFTER_MS) {
            update(failAnalysisRun(runId, "The analysis did not finish. Run it again."), { contentEdit: false });
          }
        }
      } finally {
        busy = false;
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [estimateId, runningKey]);
}

/** The latest stored state, not the render's copy. */
function currentRun(estimateId: string, runId: string) {
  return appStore.getSnapshot().estimates.find((e) => e.id === estimateId)?.analysisRuns.find((r) => r.id === runId);
}
