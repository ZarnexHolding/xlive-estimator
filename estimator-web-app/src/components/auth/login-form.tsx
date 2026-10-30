"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinkButton } from "@/components/ui/link-button";
import { appStore } from "@/lib/store";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";
import { AuthCard } from "./auth-card";

/** Only same-site relative paths are accepted as a post-login destination. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(params.get("error") ? { tone: "error", text: params.get("error")! } : null);

  if (!isSupabaseConfigured) {
    return (
      <AuthCard title="Sign-in is not enabled" description="This installation runs in demo mode: data is stored in your browser and no accounts exist.">
        <LinkButton href="/" className="w-full">
          Open the app
        </LinkButton>
      </AuthCard>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = getBrowserSupabase();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setMessage({ tone: "error", text: error.message === "Invalid login credentials" ? "Email or password is incorrect." : error.message });
        setBusy(false);
        return;
      }
      await appStore.reload(); // load this user's organisation and data
      router.replace(next);
      return;
    }
    if (password.length < 10) {
      setMessage({ tone: "error", text: "Use a password of at least 10 characters." });
      setBusy(false);
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/onboarding` },
    });
    setBusy(false);
    if (error) return setMessage({ tone: "error", text: error.message });
    if (data.session) {
      await appStore.reload();
      return router.replace("/onboarding");
    }
    setMessage({ tone: "info", text: `Check ${email.trim()} for a confirmation link, then sign in.` });
    setMode("signin");
  };

  return (
    <AuthCard
      title={mode === "signin" ? "Sign in" : "Create an account"}
      description={
        mode === "signin"
          ? "Use your XLive Estimator account."
          : "Confirm your email, then sign in. The first person to sign in sets up the organisation; everyone else is added by an administrator."
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {message && (
          <p role={message.tone === "error" ? "alert" : "status"} className={cn("text-sm", message.tone === "error" ? "text-red-700" : "text-emerald-700")}>
            {message.text}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {mode === "signin" ? "New to XLive Estimator?" : "Already have an account?"}{" "}
        <button type="button" className="font-medium text-foreground underline-offset-4 hover:underline" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(null); }}>
          {mode === "signin" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </AuthCard>
  );
}
