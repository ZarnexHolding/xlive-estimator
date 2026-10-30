"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LoadingBlock, PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CompanySettingsSchema, type CompanySettings } from "@/domain/settings";
import { appStore, DemoStore } from "@/lib/store";
import { useIsAdmin, useStore, useSystemStatus } from "@/lib/store/hooks";
import { MembersCard } from "./members-card";

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

function SettingsForm({ initial, editable }: { initial: CompanySettings; editable: boolean }) {
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    ...initial,
    addressText: initial.addressLines.join("\n"),
    termsText: initial.terms.join("\n"),
    exclusionsText: initial.exclusions.join("\n"),
    validity: String(initial.quotationValidityDays),
  });
  const field = (key: "companyName" | "legalName" | "phone" | "email" | "website" | "commercialRegistration" | "vatNumber" | "defaultCurrency" | "quotationPrefix", label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input id={key} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: key === "defaultCurrency" ? e.target.value.toUpperCase() : e.target.value })} />
    </div>
  );

  const save = async () => {
    const parsed = CompanySettingsSchema.safeParse({
      companyName: draft.companyName.trim(),
      legalName: draft.legalName.trim(),
      addressLines: lines(draft.addressText),
      phone: draft.phone.trim(),
      email: draft.email.trim(),
      website: draft.website.trim(),
      commercialRegistration: draft.commercialRegistration.trim(),
      vatNumber: draft.vatNumber.trim(),
      defaultCurrency: draft.defaultCurrency.trim(),
      quotationPrefix: draft.quotationPrefix.trim(),
      quotationValidityDays: Number(draft.validity),
      terms: lines(draft.termsText),
      exclusions: lines(draft.exclusionsText),
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "Invalid settings");
    setSaving(true);
    try {
      await appStore.saveSettings(parsed.data);
      toast.success("Settings saved. Already-issued quotations keep the details they were issued with.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company and quotation details</CardTitle>
        <CardDescription>Printed on customer quotations. Contact details default to those in XLive&apos;s own design decks; terms are placeholders to review.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {field("companyName", "Trading name")}
          {field("legalName", "Legal name")}
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="address">Address (one line per row)</Label>
            <Textarea id="address" rows={2} value={draft.addressText} onChange={(e) => setDraft({ ...draft, addressText: e.target.value })} />
          </div>
          {field("phone", "Phone")}
          {field("email", "Email")}
          {field("website", "Website")}
          {field("commercialRegistration", "Commercial registration (CR)")}
          {field("vatNumber", "VAT registration number")}
          {field("defaultCurrency", "Default currency")}
          {field("quotationPrefix", "Quotation number prefix")}
          <div className="space-y-1.5">
            <Label htmlFor="validity">Quotation validity (days)</Label>
            <Input id="validity" inputMode="numeric" value={draft.validity} onChange={(e) => setDraft({ ...draft, validity: e.target.value })} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="terms">Terms (one per line)</Label>
            <Textarea id="terms" rows={4} value={draft.termsText} onChange={(e) => setDraft({ ...draft, termsText: e.target.value })} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="exclusions">Standard exclusions (one per line)</Label>
            <Textarea id="exclusions" rows={4} value={draft.exclusionsText} onChange={(e) => setDraft({ ...draft, exclusionsText: e.target.value })} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3">
          {!editable && <span className="text-xs text-muted-foreground">Only administrators can change these settings.</span>}
          <Button onClick={save} disabled={!editable || saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const { ready, settings, mode, context } = useStore();
  const status = useSystemStatus();
  const isAdmin = useIsAdmin();
  if (!ready) return <LoadingBlock />;

  return (
    <div>
      <PageHeader title="Settings" description="Company details for quotations, and system configuration status." />
      <div className="grid gap-4 p-6 xl:grid-cols-[1fr_380px]">
        <SettingsForm key={JSON.stringify(settings)} initial={settings} editable={isAdmin} />
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Data storage:</span>{" "}
                {mode === "supabase" ? `Supabase database and private file storage (${context?.organisationName ?? "no organisation"})` : "this browser only (demo mode)"}
              </p>
              {mode === "supabase" && (
                <p>
                  <span className="text-muted-foreground">Server approval key:</span> {status === null ? "…" : status.serverKeyConfigured ? "configured" : "missing (approvals and quotations will be refused)"}
                </p>
              )}
              <p>
                <span className="text-muted-foreground">AI analysis:</span>{" "}
                {status === null ? "…" : status.ai.enabled ? `available (${status.ai.model})` : status.ai.configured ? "key set, disabled until sign-in exists" : "not configured"}
              </p>
              <p>
                <span className="text-muted-foreground">PDF upload limit:</span> {status ? `${status.maxPdfBytes / 1024 / 1024} MB` : "…"}
              </p>
            </CardContent>
          </Card>
          {mode === "supabase" && <MembersCard isAdmin={isAdmin} />}
          {appStore instanceof DemoStore && (
          <Card>
            <CardHeader>
              <CardTitle>Demo data</CardTitle>
              <CardDescription>Remove every estimate, catalogue change, setting and uploaded PDF stored in this browser, and reload the three reference samples.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!window.confirm("Delete all locally stored data and restore the demo samples? This cannot be undone.")) return;
                  if (appStore instanceof DemoStore) await appStore.resetDemoData();
                  toast.success("Demo data reset");
                }}
              >
                Reset demo data
              </Button>
            </CardContent>
          </Card>
          )}
        </div>
      </div>
    </div>
  );
}
