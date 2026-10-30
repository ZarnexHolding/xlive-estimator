"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LoadingBlock } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinkButton } from "@/components/ui/link-button";
import { DEFAULT_COMPANY_SETTINGS } from "@/domain/settings";
import { appStore } from "@/lib/store";
import { useStore } from "@/lib/store/hooks";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { friendlyDbError } from "@/lib/supabase/mappers";
import { AuthCard } from "./auth-card";

/**
 * First sign-in: the very first user creates the company organisation and becomes its admin.
 * Anyone else waits to be added by an admin (they cannot create a second organisation).
 */
export function Onboarding() {
  const { ready, mode, context } = useStore();
  const [orgName, setOrgName] = useState(DEFAULT_COMPANY_SETTINGS.companyName);
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (ready && context?.organisationId) router.replace("/");
  }, [ready, context, router]);

  if (mode === "demo") {
    return (
      <AuthCard title="Not needed in demo mode">
        <LinkButton href="/" className="w-full">
          Open the app
        </LinkButton>
      </AuthCard>
    );
  }
  if (!ready || context?.organisationId) return <LoadingBlock />;
  if (!context) {
    return (
      <AuthCard title="Please sign in">
        <LinkButton href="/login" className="w-full">
          Sign in
        </LinkButton>
      </AuthCard>
    );
  }

  const signOut = async () => {
    await getBrowserSupabase().auth.signOut();
    await appStore.reload();
    router.replace("/login");
  };

  if (context.organisationsExist) {
    return (
      <AuthCard title="Waiting for access" description={`You are signed in as ${context.email}.`}>
        <p className="text-sm">Ask an XLive Estimator administrator to add this email address under Settings → Team members, then check again.</p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => window.location.reload()}>
            Check again
          </Button>
          <Button variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </AuthCard>
    );
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return toast.error("Enter the company name.");
    setBusy(true);
    const { error } = await getBrowserSupabase().rpc("create_organisation", { p_name: orgName.trim(), p_full_name: fullName.trim() });
    if (error) {
      setBusy(false);
      return toast.error(friendlyDbError(error));
    }
    await appStore.reload();
    try {
      // Start from the default quotation details (placeholders are marked for review).
      await appStore.saveSettings({ ...DEFAULT_COMPANY_SETTINGS, companyName: orgName.trim() });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Company settings could not be saved; set them in Settings.");
    }
    router.replace("/");
  };

  return (
    <AuthCard title="Set up your organisation" description="You are the first user, so you will be the administrator. Colleagues sign up and you add them from Settings.">
      <form onSubmit={create} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="org">Company name</Label>
          <Input id="org" value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Creating…" : "Create organisation"}
        </Button>
      </form>
    </AuthCard>
  );
}
