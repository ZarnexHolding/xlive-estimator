"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { friendlyDbError } from "@/lib/supabase/mappers";

const MembersSchema = z.array(z.object({ userId: z.string(), email: z.string().nullable(), fullName: z.string(), role: z.enum(["admin", "estimator", "viewer"]) }));
type Member = z.infer<typeof MembersSchema>[number];

/** Organisation members. New people sign up first; an administrator then adds them here. */
export function MembersCard({ isAdmin }: { isAdmin: boolean }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Member["role"]>("estimator");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await getBrowserSupabase().rpc("list_members");
    if (error) return toast.error(friendlyDbError(error));
    const parsed = MembersSchema.safeParse(data);
    setMembers(parsed.success ? parsed.data : []);
  }, []);

  useEffect(() => {
    let active = true;
    getBrowserSupabase()
      .rpc("list_members")
      .then(({ data }) => {
        const parsed = MembersSchema.safeParse(data);
        if (active) setMembers(parsed.success ? parsed.data : []);
      });
    return () => {
      active = false;
    };
  }, []);

  const add = async () => {
    if (!email.trim()) return toast.error("Enter the person's email address.");
    setBusy(true);
    const { error } = await getBrowserSupabase().rpc("add_member", { p_email: email.trim(), p_role: role, p_full_name: name.trim() });
    setBusy(false);
    if (error) return toast.error(friendlyDbError(error));
    toast.success(`${email.trim()} added as ${role}`);
    setEmail("");
    setName("");
    await load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team members</CardTitle>
        <CardDescription>Estimators can edit and approve estimates; viewers can only read; administrators also manage prices, settings and members.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {members === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="divide-y text-sm">
            {members.map((m) => (
              <li key={m.userId} className="flex justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate">
                  {m.fullName || m.email} {m.fullName && <span className="text-muted-foreground">({m.email})</span>}
                </span>
                <span className="text-muted-foreground capitalize">{m.role}</span>
              </li>
            ))}
          </ul>
        )}
        {isAdmin && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs text-muted-foreground">The person must create an account on the sign-in page first.</p>
            <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Member email" />
            <div className="flex gap-2">
              <Input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Member name" />
              <NativeSelect value={role} onChange={(e) => setRole(e.target.value as Member["role"])} aria-label="Role">
                <option value="estimator">Estimator</option>
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </NativeSelect>
            </div>
            <Button size="sm" onClick={add} disabled={busy}>
              Add member
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
