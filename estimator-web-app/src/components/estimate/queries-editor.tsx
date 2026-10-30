"use client";

import { CheckCircle2, CircleHelp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { makeQuery, resolveQuery } from "@/domain/factories";
import type { Query } from "@/domain/schemas";
import { newId } from "@/lib/ids";
import { formatDate } from "@/lib/format";

/** Open clarification questions. Open queries block approval until resolved with a note. */
export function QueriesEditor({ queries, onChange, emptyText = "No open questions." }: { queries: Query[]; onChange: (next: Query[]) => void; emptyText?: string }) {
  const [text, setText] = useState("");
  const [resolving, setResolving] = useState<Record<string, string>>({});

  const add = () => {
    if (!text.trim()) return;
    onChange([...queries, makeQuery(newId(), text.trim(), new Date().toISOString())]);
    setText("");
  };
  const resolve = (q: Query) => {
    try {
      onChange(queries.map((x) => (x.id === q.id ? resolveQuery(x, resolving[q.id] ?? "", new Date().toISOString()) : x)));
      setResolving((r) => ({ ...r, [q.id]: "" }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not resolve the query");
    }
  };

  return (
    <div className="space-y-2">
      {queries.length === 0 && <p className="text-sm text-muted-foreground">{emptyText}</p>}
      <ul className="space-y-2">
        {queries.map((q) => (
          <li key={q.id} className="rounded-md border p-2.5 text-sm">
            <div className="flex items-start gap-2">
              {q.status === "open" ? <CircleHelp className="mt-0.5 size-4 shrink-0 text-red-600" aria-label="Open" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Resolved" />}
              <div className="min-w-0 flex-1">
                <p>{q.text}</p>
                {q.status === "resolved" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Resolved {q.resolvedAt && formatDate(q.resolvedAt)}: {q.resolution}
                  </p>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={resolving[q.id] ?? ""}
                      onChange={(e) => setResolving((r) => ({ ...r, [q.id]: e.target.value }))}
                      placeholder="Answer / resolution note (required)"
                      aria-label="Resolution note"
                      className="h-7 text-xs"
                    />
                    <Button size="sm" variant="outline" onClick={() => resolve(q)}>
                      Resolve
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} placeholder="Add a question for clarification" aria-label="New query" className="h-8" />
        <Button size="sm" variant="secondary" onClick={add} disabled={!text.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}
