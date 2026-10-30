"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { ProjectFields } from "@/components/estimate/project-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { newEstimate } from "@/domain/factories";
import { CurrencySchema, type ProjectInfo } from "@/domain/schemas";
import { newId } from "@/lib/ids";
import { appStore } from "@/lib/store";
import { useStore } from "@/lib/store/hooks";

export function NewEstimateForm() {
  const router = useRouter();
  const { settings } = useStore();
  const [project, setProject] = useState<ProjectInfo>({
    projectName: "",
    clientName: "",
    projectType: "exhibition_booth",
    venue: "",
    eventDates: "",
    estimator: "",
    notes: "",
  });
  const [currency, setCurrency] = useState<string | null>(null);
  const effectiveCurrency = currency ?? settings.defaultCurrency;

  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project.projectName.trim()) {
      toast.error("Enter a project name.");
      return;
    }
    if (!CurrencySchema.safeParse(effectiveCurrency).success) {
      toast.error("Currency must be a 3-letter ISO code such as SAR.");
      return;
    }
    const at = new Date().toISOString();
    const estimate = newEstimate({ id: newId(), project: { ...project, projectName: project.projectName.trim() }, at, currency: effectiveCurrency });
    setSaving(true);
    try {
      await appStore.saveEstimate(estimate);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the estimate.");
      setSaving(false);
      return;
    }
    router.push(`/estimates/${estimate.id}?step=documents`);
  };

  return (
    <div>
      <PageHeader title="New estimate" description="Step 1 of the workflow: project details. You can upload drawings next." />
      <form onSubmit={submit} className="max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Project details</CardTitle>
            <CardDescription>All fields except the project name can be completed later.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ProjectFields value={project} onChange={setProject} currency={effectiveCurrency} onCurrencyChange={setCurrency} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create and continue"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
