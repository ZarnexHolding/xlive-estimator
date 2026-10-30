"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { Estimate } from "@/domain/estimate";
import { withDraftEdit } from "@/domain/versioning";
import type { SystemStatus } from "@/lib/env";
import { appStore } from "./index";
import type { StoreSnapshot } from "./types";

export function useStore(): StoreSnapshot {
  const snapshot = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getServerSnapshot);
  useEffect(() => appStore.load(), []);
  return snapshot;
}

export function useEstimate(id: string): { ready: boolean; estimate: Estimate | null } {
  const { ready, estimates } = useStore();
  return { ready, estimate: estimates.find((e) => e.id === id) ?? null };
}

/** True when the signed-in user may change estimates (always true in demo mode). */
export function useCanEdit(): boolean {
  const { mode, context } = useStore();
  return mode === "demo" || context?.role === "admin" || context?.role === "estimator";
}

export function useIsAdmin(): boolean {
  const { mode, context } = useStore();
  return mode === "demo" || context?.role === "admin";
}

export type EstimateRecipe = (estimate: Estimate) => Estimate;

/**
 * Apply a change to an estimate. Content edits move an approved estimate back to draft
 * (its approved versions are kept). Returns false and shows the reason if it is rejected;
 * a later save failure is reported and the estimate is reloaded from storage.
 */
export function useUpdateEstimate(id: string) {
  return useCallback(
    (recipe: EstimateRecipe, options: { contentEdit?: boolean } = {}): boolean => {
      const current = appStore.getSnapshot().estimates.find((e) => e.id === id);
      if (!current) {
        toast.error("Estimate not found.");
        return false;
      }
      try {
        const at = new Date().toISOString();
        let next = recipe(structuredClone(current));
        next = options.contentEdit === false ? { ...next, updatedAt: at } : withDraftEdit(next, at);
        appStore.saveEstimate(next).catch((error: unknown) => toast.error(error instanceof Error ? error.message : "The change could not be saved."));
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The change could not be saved.");
        return false;
      }
    },
    [id],
  );
}

let statusPromise: Promise<SystemStatus | null> | null = null;

export function useSystemStatus(): SystemStatus | null {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  useEffect(() => {
    statusPromise ??= fetch("/api/status")
      .then((r) => (r.ok ? (r.json() as Promise<SystemStatus>) : null))
      .catch(() => null);
    let active = true;
    statusPromise.then((s) => active && setStatus(s));
    return () => {
      active = false;
    };
  }, []);
  return status;
}
