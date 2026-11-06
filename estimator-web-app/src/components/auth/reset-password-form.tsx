"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinkButton } from "@/components/ui/link-button";
import { newPasswordProblem } from "@/lib/password";
import { appStore } from "@/lib/store";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AuthCard } from "./auth-card";

/**
 * Sets a new password. The emailed reset link lands on /auth/confirm, which signs the person in and
 * sends them here; the proxy sends anyone without a session to /login.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isSupabaseConfigured) {
    return (
      <AuthCard title="Not needed in demo mode">
        <LinkButton href="/" className="w-full">
          Open the app
        </LinkButton>
      </AuthCard>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = newPasswordProblem(password, confirmation);
    setError(problem);
    if (problem) return;
    setBusy(true);
    const { error: updateError } = await getBrowserSupabase().auth.updateUser({ password });
    if (updateError) {
      setBusy(false);
      return setError(updateError.message);
    }
    await appStore.reload();
    toast.success("Password changed.");
    router.replace("/");
  };

  return (
    <AuthCard title="Choose a new password" description="You will stay signed in on this device.">
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Repeat the new password</Label>
          <Input id="confirm-password" type="password" autoComplete="new-password" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Please wait…" : "Change password"}
        </Button>
      </form>
    </AuthCard>
  );
}
