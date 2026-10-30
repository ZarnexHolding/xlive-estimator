"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { PROJECT_TYPE_LABELS } from "@/domain/quotation";
import { PROJECT_TYPES, type ProjectInfo, type ProjectType } from "@/domain/schemas";

export function ProjectFields({
  value,
  onChange,
  currency,
  onCurrencyChange,
  currencyLocked,
}: {
  value: ProjectInfo;
  onChange: (next: ProjectInfo) => void;
  currency: string;
  onCurrencyChange?: (currency: string) => void;
  currencyLocked?: boolean;
}) {
  const set = <K extends keyof ProjectInfo>(key: K, v: ProjectInfo[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1.5 md:col-span-2">
        <Label htmlFor="projectName">Project name *</Label>
        <Input id="projectName" required value={value.projectName} onChange={(e) => set("projectName", e.target.value)} placeholder="e.g. EMDAD exhibition booth 14 m × 5 m" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="clientName">Client / brand</Label>
        <Input id="clientName" value={value.clientName} onChange={(e) => set("clientName", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="projectType">Project type</Label>
        <NativeSelect id="projectType" className="w-full" value={value.projectType} onChange={(e) => set("projectType", e.target.value as ProjectType)}>
          {PROJECT_TYPES.map((t) => (
            <option key={t} value={t}>
              {PROJECT_TYPE_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="venue">Venue</Label>
        <Input id="venue" value={value.venue} onChange={(e) => set("venue", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="eventDates">Event / build dates</Label>
        <Input id="eventDates" value={value.eventDates} onChange={(e) => set("eventDates", e.target.value)} placeholder="e.g. 12–15 Nov 2026, build 10–11 Nov" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="estimator">Assigned estimator</Label>
        <Input id="estimator" value={value.estimator} onChange={(e) => set("estimator", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="currency">Currency</Label>
        <Input
          id="currency"
          value={currency}
          maxLength={3}
          disabled={currencyLocked || !onCurrencyChange}
          onChange={(e) => onCurrencyChange?.(e.target.value.toUpperCase())}
          aria-describedby="currency-hint"
        />
        <p id="currency-hint" className="text-xs text-muted-foreground">
          ISO code, e.g. SAR. {currencyLocked && "Fixed once cost lines exist."}
        </p>
      </div>
      <div className="space-y-1.5 md:col-span-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={3} value={value.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
    </div>
  );
}
