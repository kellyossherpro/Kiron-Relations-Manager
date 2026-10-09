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
  viewer: "Read only (plus any sign-offs their group does)",
};
const ROLES: Role[] = ["admin", "manager", "sales", "account_manager", "legal", "viewer"];

type U = { id: string; name: string; email: string | null; title: string | null; role: string; active: boolean; teams: string[] };

export function AdminUsers({ users, meId }: { users: U[]; meId: string }) {
  const router = useRouter();
  const [find, setFind] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const q = find.trim().toLowerCase();
  const shown = q ? users.filter((u) => [u.name, u.title ?? "", ...u.teams, ROLE_LABEL[u.role as Role] ?? ""].some((t) => t.toLowerCase().includes(q))) : users;

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
      <p className="mb-4 text-sm text-muted">Who can sign in, and what they can do. {users.length} people.</p>
      <label className="sr-only" htmlFor="people-find">Find a person</label>
      <input id="people-find" className="input mb-3 max-w-sm" placeholder="Find by name, job, department or role" value={find} onChange={(e) => setFind(e.target.value)} />
      <div className="max-h-[32rem] overflow-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b border-line bg-white text-left text-xs tracking-wide text-muted uppercase">
            <tr><th className="p-2">Name</th><th className="p-2">Department</th><th className="p-2">Role</th><th className="p-2">Access</th></tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id} className={`border-b border-line last:border-0 ${u.active ? "" : "opacity-50"}`}>
                <td className="p-2">
                  <p className="font-bold">{u.name}{u.id === meId && " (you)"}</p>
                  <p className="text-xs text-muted">{[u.title, u.email].filter(Boolean).join(" · ")}</p>
                </td>
                <td className="p-2 text-xs">{u.teams.join(", ") || <span className="text-muted">None yet</span>}</td>
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
            {shown.length === 0 && <tr><td className="p-3 text-muted" colSpan={4}>Nobody matches &ldquo;{find}&rdquo;.</td></tr>}
          </tbody>
        </table>
      </div>
      <form
        className="mt-4 grid gap-3 rounded-lg bg-paper p-4 sm:grid-cols-[1fr_1fr_1fr_180px_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createUserAction({ name, title, email, role }), () => { setName(""); setTitle(""); setEmail(""); });
        }}
      >
        <div><label className="label" htmlFor="new-name">Name</label><input id="new-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label" htmlFor="new-title">Job title (optional)</label><input id="new-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label className="label" htmlFor="new-email">Work email (optional)</label><input id="new-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div>
          <label className="label" htmlFor="new-role">Role</label>
          <select id="new-role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        <button className="btn-primary" disabled={pending}>Add person</button>
        <p className="text-xs text-muted sm:col-span-5">{ROLE_HELP[role]}. Without an email, they&rsquo;re matched to their Microsoft account when they first sign in.</p>
      </form>
      {msg && <p className="mt-3 text-sm text-danger" role="alert">{msg}</p>}
    </section>
  );
}
