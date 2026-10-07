"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createUserAction, updateUserAction } from "@/app/actions";
import type { Role } from "@/db/schema";
import { ROLE_LABEL } from "@/lib/format";

const ROLE_HELP: Record<string, string> = {
  admin: "Everything, plus people and fields",
  manager: "Edit every record, move deals",
  sales: "Edit own deals and records",
  account_manager: "Edit own deals and records",
  legal: "Edit only fields opened to Legal",
  viewer: "Read only",
};
const ROLES: Role[] = ["admin", "manager", "sales", "account_manager", "legal", "viewer"];

type U = { id: string; name: string; email: string; role: string; active: boolean };

export function AdminUsers({ users, meId }: { users: U[]; meId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("sales");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? null : (res.error ?? "Something went wrong."));
      if (res.ok) after?.();
      router.refresh();
    });
  }

  return (
    <section className="card p-5" aria-label="People">
      <h2 className="h2 mb-1">People</h2>
      <p className="mb-4 text-sm text-muted">Who can sign in, and what they can do.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs tracking-wide text-muted uppercase">
            <tr><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Role</th><th className="p-2">Access</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={`border-b border-line last:border-0 ${u.active ? "" : "opacity-50"}`}>
                <td className="p-2 font-bold">{u.name}{u.id === meId && " (you)"}</td>
                <td className="p-2">{u.email}</td>
                <td className="p-2">
                  <select aria-label={`Role for ${u.name}`} className="input py-1" value={u.role} disabled={pending} onChange={(e) => run(() => updateUserAction(u.id, { role: e.target.value as Role }))}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </td>
                <td className="p-2">
                  <button className="text-xs font-bold text-muted hover:text-ink" disabled={pending} onClick={() => run(() => updateUserAction(u.id, { active: !u.active }))}>
                    {u.active ? "Turn off" : "Turn on"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="mt-4 grid gap-3 rounded-lg bg-paper p-4 sm:grid-cols-[1fr_1fr_200px_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createUserAction({ name, email, role }), () => { setName(""); setEmail(""); });
        }}
      >
        <div><label className="label" htmlFor="new-name">Name</label><input id="new-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label" htmlFor="new-email">Work email</label><input id="new-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div>
          <label className="label" htmlFor="new-role">Role</label>
          <select id="new-role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        <button className="btn-primary" disabled={pending}>Add person</button>
        <p className="text-xs text-muted sm:col-span-4">{ROLE_HELP[role]}</p>
      </form>
      {msg && <p className="mt-3 text-sm text-danger" role="alert">{msg}</p>}
    </section>
  );
}
