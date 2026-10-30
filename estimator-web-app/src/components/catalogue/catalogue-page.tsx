"use client";

import { History, Plus, Search } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pill } from "@/components/common/badges";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/common/page-header";
import { COST_TYPE_LABELS } from "@/components/estimate/line-items-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { currentRate, type CatalogueItem, type CatalogueRate } from "@/domain/catalogue";
import { parseDecimalInput } from "@/domain/money";
import { COST_TYPES, CurrencySchema, type CostType } from "@/domain/schemas";
import { UNITS, UNIT_LABELS, type Unit } from "@/domain/units";
import { newId } from "@/lib/ids";
import { referenceCatalogue } from "@/domain/reference-data/catalogue";
import { appStore } from "@/lib/store";
import { useIsAdmin, useStore } from "@/lib/store/hooks";
import { formatAmount, formatDate } from "@/lib/format";

const today = () => new Date().toISOString().slice(0, 10);

interface RateDraft {
  rate: string;
  currency: string;
  verification: "provisional" | "verified";
  source: string;
  effectiveFrom: string;
}

function RateFields({ draft, onChange }: { draft: RateDraft; onChange: (d: RateDraft) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="r-rate">Cost rate</Label>
        <Input id="r-rate" inputMode="decimal" value={draft.rate} onChange={(e) => onChange({ ...draft, rate: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="r-cur">Currency</Label>
        <Input id="r-cur" maxLength={3} value={draft.currency} onChange={(e) => onChange({ ...draft, currency: e.target.value.toUpperCase() })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="r-ver">Status</Label>
        <NativeSelect id="r-ver" className="w-full" value={draft.verification} onChange={(e) => onChange({ ...draft, verification: e.target.value as RateDraft["verification"] })}>
          <option value="provisional">Provisional (not verified)</option>
          <option value="verified">Verified current price</option>
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="r-eff">Effective from</Label>
        <Input id="r-eff" type="date" value={draft.effectiveFrom} onChange={(e) => onChange({ ...draft, effectiveFrom: e.target.value })} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="r-src">Source</Label>
        <Input id="r-src" value={draft.source} onChange={(e) => onChange({ ...draft, source: e.target.value })} placeholder="e.g. Supplier quote #123, 28 Oct 2026" />
      </div>
    </div>
  );
}

function toRate(draft: RateDraft): CatalogueRate | string {
  const rate = parseDecimalInput(draft.rate);
  if (rate === null || rate.startsWith("-")) return "Enter a non-negative rate.";
  if (!CurrencySchema.safeParse(draft.currency).success) return "Currency must be a 3-letter code.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.effectiveFrom)) return "Choose an effective date.";
  if (!draft.source.trim()) return "Record where this price comes from.";
  return { id: newId(), rate, currency: draft.currency, verification: draft.verification, source: draft.source.trim(), effectiveFrom: draft.effectiveFrom, recordedAt: new Date().toISOString() };
}

export function CataloguePage() {
  const { ready, catalogue, settings } = useStore();
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [priceFor, setPriceFor] = useState<CatalogueItem | null>(null);
  const [adding, setAdding] = useState(false);
  const emptyRate = (): RateDraft => ({ rate: "", currency: settings.defaultCurrency, verification: "provisional", source: "", effectiveFrom: today() });
  const [rateDraft, setRateDraft] = useState<RateDraft>(emptyRate);
  const [item, setItem] = useState({ name: "", category: "", unit: "m2" as Unit, costType: "material" as CostType, supplier: "", notes: "", thicknessMm: "", sheetLengthMm: "", sheetWidthMm: "", withRate: true });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalogue.filter((c) => (showInactive || c.active) && (!q || `${c.name} ${c.category} ${c.supplier}`.toLowerCase().includes(q)));
  }, [catalogue, query, showInactive]);

  const isAdmin = useIsAdmin();
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>, message: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(message);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const recordPrice = async () => {
    if (!priceFor) return;
    const rate = toRate(rateDraft);
    if (typeof rate === "string") return toast.error(rate);
    if (await run(() => appStore.addCatalogueRate(priceFor.id, rate), `New price recorded for "${priceFor.name}". Existing estimates are unchanged.`)) setPriceFor(null);
  };

  /** Load the provisional EMDAD reference rates (flagged provisional) into an empty catalogue. */
  const importReference = () =>
    run(async () => {
      for (const ref of referenceCatalogue()) {
        await appStore.addCatalogueItem({ ...ref, id: newId(), rates: ref.rates.map((r) => ({ ...r, id: newId(), recordedAt: new Date().toISOString() })) });
      }
    }, "Provisional reference rates imported");

  const addItem = async () => {
    if (!item.name.trim()) return toast.error("Enter a name.");
    const spec = (v: string) => (v.trim() ? parseDecimalInput(v) : null);
    let rates: CatalogueRate[] = [];
    if (item.withRate) {
      const rate = toRate(rateDraft);
      if (typeof rate === "string") return toast.error(rate);
      rates = [rate];
    }
    const at = new Date().toISOString();
    const next: CatalogueItem = {
      id: newId(),
      name: item.name.trim(),
      category: item.category.trim(),
      unit: item.unit,
      costType: item.costType,
      supplier: item.supplier.trim(),
      notes: item.notes.trim(),
      active: true,
      specs: { thicknessMm: spec(item.thicknessMm), sheetLengthMm: spec(item.sheetLengthMm), sheetWidthMm: spec(item.sheetWidthMm) },
      rates,
      updatedAt: at,
    };
    if (await run(() => appStore.addCatalogueItem(next), `"${next.name}" added`)) setAdding(false);
  };

  if (!ready) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Price catalogue"
        description="Company cost rates. Prices are versioned: recording a new price never changes estimates that already copied the old one."
        actions={
          isAdmin ? (
            <Button onClick={() => { setRateDraft(emptyRate()); setAdding(true); }}>
              <Plus /> Add item
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">Only administrators can change prices.</span>
          )
        }
      />
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-72">
            <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items, categories, suppliers" className="pl-8" aria-label="Search catalogue" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={showInactive} onCheckedChange={(v) => setShowInactive(v === true)} /> Show inactive
          </label>
          <span className="ml-auto text-xs text-muted-foreground">Provisional = from earlier XLive costings, not verified market prices.</span>
        </div>
        <div className="rounded-lg border bg-background">
          {rows.length === 0 ? (
            <EmptyState
              title="No catalogue items"
              action={
                isAdmin && catalogue.length === 0 ? (
                  <Button variant="outline" disabled={busy} onClick={importReference}>
                    Import provisional XLive reference rates
                  </Button>
                ) : undefined
              }
            >
              {isAdmin && catalogue.length === 0 && "The EMDAD reference rates can be imported as a starting point. They are flagged provisional, not verified prices."}
            </EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Cost type</TableHead>
                  <TableHead className="text-right">Current rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const rate = currentRate(c, today());
                  return (
                    <Fragment key={c.id}>
                      <TableRow className={c.active ? "" : "opacity-60"}>
                        <TableCell className="max-w-[300px] whitespace-normal">
                          <p className="font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.category}</p>
                          {c.specs.thicknessMm && <p className="text-xs text-muted-foreground">{c.specs.thicknessMm} mm{c.specs.sheetLengthMm && c.specs.sheetWidthMm ? ` · sheet ${c.specs.sheetLengthMm} × ${c.specs.sheetWidthMm} mm` : ""}</p>}
                          {c.notes && <p className="mt-0.5 text-xs text-amber-800">{c.notes}</p>}
                        </TableCell>
                        <TableCell className="text-sm">{UNIT_LABELS[c.unit].long}</TableCell>
                        <TableCell className="text-sm">{COST_TYPE_LABELS[c.costType]}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{rate ? `${rate.currency} ${formatAmount(rate.rate)}` : <span className="text-xs font-sans text-red-700">Price not configured</span>}</TableCell>
                        <TableCell>{rate && <Pill tone={rate.verification === "verified" ? "success" : "warning"}>{rate.verification}</Pill>}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{rate?.effectiveFrom ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.supplier || "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {isAdmin && (
                              <Button size="sm" variant="outline" onClick={() => { setRateDraft({ ...emptyRate(), currency: rate?.currency ?? settings.defaultCurrency }); setPriceFor(c); }}>
                                Record price
                              </Button>
                            )}
                            <Button size="icon-sm" variant="ghost" aria-label={`Price history for ${c.name}`} onClick={() => setHistoryFor(historyFor === c.id ? null : c.id)}>
                              <History />
                            </Button>
                            {isAdmin && (
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => appStore.setCatalogueItemActive(c.id, !c.active), c.active ? "Item deactivated" : "Item activated")}>
                                {c.active ? "Deactivate" : "Activate"}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {historyFor === c.id && (
                        <TableRow>
                          <TableCell colSpan={8} className="bg-muted/40">
                            {c.rates.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No prices recorded.</p>
                            ) : (
                              <ul className="space-y-1 text-xs">
                                {[...c.rates].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).map((r) => (
                                  <li key={r.id} className="flex flex-wrap gap-3">
                                    <span className="font-mono">
                                      {r.currency} {formatAmount(r.rate)}
                                    </span>
                                    <Pill tone={r.verification === "verified" ? "success" : "warning"}>{r.verification}</Pill>
                                    <span>effective {r.effectiveFrom}</span>
                                    <span className="text-muted-foreground">recorded {formatDate(r.recordedAt)}</span>
                                    <span className="text-muted-foreground">{r.source}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <Dialog open={priceFor !== null} onOpenChange={(o) => !o && setPriceFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record new price: {priceFor?.name}</DialogTitle>
            <DialogDescription>
              Adds a price version per {priceFor && UNIT_LABELS[priceFor.unit].long.toLowerCase()}. Earlier versions are kept, and estimates that already use this item keep their copied rate.
            </DialogDescription>
          </DialogHeader>
          <RateFields draft={rateDraft} onChange={setRateDraft} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriceFor(null)}>
              Cancel
            </Button>
            <Button onClick={recordPrice}>Record price</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add catalogue item</DialogTitle>
            <DialogDescription>The unit defines what the rate is &quot;per&quot;. A per-piece rate can only price a count; the costing engine enforces this.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="c-name">Item or service *</Label>
              <Input id="c-name" value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-cat">Category</Label>
              <Input id="c-cat" value={item.category} onChange={(e) => setItem({ ...item, category: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-sup">Supplier</Label>
              <Input id="c-sup" value={item.supplier} onChange={(e) => setItem({ ...item, supplier: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-unit">Unit</Label>
              <NativeSelect id="c-unit" className="w-full" value={item.unit} onChange={(e) => setItem({ ...item, unit: e.target.value as Unit })}>
                {UNITS.filter((u) => u !== "unit_tbc").map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u].long}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-type">Cost type</Label>
              <NativeSelect id="c-type" className="w-full" value={item.costType} onChange={(e) => setItem({ ...item, costType: e.target.value as CostType })}>
                {COST_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {COST_TYPE_LABELS[t]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <fieldset className="grid grid-cols-3 gap-2 sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">Material specification (optional)</legend>
              <Input aria-label="Thickness (mm)" placeholder="Thickness mm" value={item.thicknessMm} onChange={(e) => setItem({ ...item, thicknessMm: e.target.value })} />
              <Input aria-label="Sheet length (mm)" placeholder="Sheet length mm" value={item.sheetLengthMm} onChange={(e) => setItem({ ...item, sheetLengthMm: e.target.value })} />
              <Input aria-label="Sheet width (mm)" placeholder="Sheet width mm" value={item.sheetWidthMm} onChange={(e) => setItem({ ...item, sheetWidthMm: e.target.value })} />
            </fieldset>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="c-notes">Notes</Label>
              <Input id="c-notes" value={item.notes} onChange={(e) => setItem({ ...item, notes: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox checked={item.withRate} onCheckedChange={(v) => setItem({ ...item, withRate: v === true })} /> Record an initial price now
            </label>
          </div>
          {item.withRate && <RateFields draft={rateDraft} onChange={setRateDraft} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button onClick={addItem}>Add item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
