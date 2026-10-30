"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { EmptyState, LoadingBlock } from "@/components/common/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { useStore } from "@/lib/store/hooks";

/**
 * Connected mode: the app needs a signed-in member of an organisation. Users without one are
 * sent to onboarding; an expired session is offered a sign-in link. Demo mode passes through.
 */
export function OrganisationGate({ children }: { children: React.ReactNode }) {
  const { mode, ready, context, loadErrors } = useStore();
  const router = useRouter();
  const needsOnboarding = mode === "supabase" && ready && context !== null && !context.organisationId;

  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding");
  }, [needsOnboarding, router]);

  // While loading, render the page: each page shows its own loading state (and Next.js can
  // validate the segment for instant navigation). Only a resolved session can change the view.
  if (mode === "demo" || !ready) return children;
  if (needsOnboarding) return <LoadingBlock />;
  if (!context) {
    return (
      <div className="p-6">
        <EmptyState title="You are not signed in" action={<LinkButton href="/login">Sign in</LinkButton>}>
          {loadErrors[0] ?? "Your session may have expired."}
        </EmptyState>
      </div>
    );
  }
  return children;
}
