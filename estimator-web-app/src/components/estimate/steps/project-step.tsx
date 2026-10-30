"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencySchema } from "@/domain/schemas";
import { ProjectFields } from "../project-form";
import type { StepProps } from "../workspace";

export function ProjectStep({ estimate, update, goTo }: StepProps) {
  const [draft, setDraft] = useState(estimate.project);
  const [currency, setCurrency] = useState(estimate.costing.currency);
  const dirty = JSON.stringify(draft) !== JSON.stringify(estimate.project) || currency !== estimate.costing.currency;

  const save = () => {
    if (!draft.projectName.trim()) return toast.error("Project name is required.");
    if (!CurrencySchema.safeParse(currency).success) return toast.error("Currency must be a 3-letter ISO code.");
    const ok = update((e) => ({ ...e, project: { ...draft, projectName: draft.projectName.trim() }, costing: { ...e.costing, currency } }));
    if (ok) toast.success("Project details saved");
  };

  return (
    <div className="max-w-3xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Project details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <ProjectFields
            value={draft}
            onChange={setDraft}
            currency={currency}
            onCurrencyChange={setCurrency}
            currencyLocked={estimate.costing.lineItems.some((l) => l.rate !== null)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={!dirty} onClick={() => { setDraft(estimate.project); setCurrency(estimate.costing.currency); }}>
              Discard changes
            </Button>
            <Button disabled={!dirty} onClick={save}>
              Save
            </Button>
            <Button variant="secondary" onClick={() => goTo("documents")}>
              Next: documents
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
