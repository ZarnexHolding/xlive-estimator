"use client";

import { Database, LogOut, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { appStore } from "@/lib/store";
import { useStore, useSystemStatus } from "@/lib/store/hooks";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

/** Always-visible statement of where data lives, who is signed in, and whether AI is really available. */
export function ModeBanner() {
  const status = useSystemStatus();
  const { mode, context, loadErrors } = useStore();
  const connected = mode === "supabase";
  const router = useRouter();
  const signOut = async () => {
    await getBrowserSupabase().auth.signOut();
    await appStore.reload(); // clears this user's data from memory
    router.replace("/login");
  };

  const ai =
    status === null
      ? "Checking AI configuration…"
      : status.ai.enabled
        ? `AI analysis available (${status.ai.model})`
        : status.ai.configured
          ? "AI analysis disabled on this deployment until sign-in is enabled"
          : "AI analysis not configured (ANTHROPIC_API_KEY missing)";

  return (
    <div className={cn("border-b", connected ? "bg-background text-muted-foreground" : "bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100")}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-1.5 text-xs">
        <span className="flex items-center gap-1.5">
          <Database className="size-3.5" aria-hidden />
          {connected ? (
            <>
              <strong className="font-semibold text-foreground">{context?.organisationName ?? "No organisation"}</strong>
              {context && (
                <span>
                  · {context.email} · <span className="capitalize">{context.role ?? "no role"}</span>
                </span>
              )}
            </>
          ) : (
            <>
              <strong className="font-semibold">Demo mode:</strong> estimates are stored in this browser only and are not saved to a database.
            </>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <Sparkles className="size-3.5" aria-hidden />
          {ai}
        </span>
        {loadErrors.length > 0 && <span className="font-medium text-red-700">{loadErrors.join(" ")}</span>}
        {connected && context && (
          <Button variant="ghost" size="xs" className="ml-auto" onClick={signOut}>
            <LogOut /> Sign out
          </Button>
        )}
      </div>
    </div>
  );
}
