"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { applyKironOrgAction, createTeamAction, deleteTeamAction, setTeamMemberAction, updateTeamAction } from "@/app/actions";
import { SearchSelect, type Option } from "./search-select";

type Member = { id: string; name: string; title: string | null };
type Team = { id: string; name: string; kind: "department" | "group"; seesCommercials: boolean; members: Member[]; fields: string[] };
type Result = { ok: boolean; error?: string; message?: string };

export function AdminTeams({ teams, people, kironSetUp }: { teams: Team[]; people: Option[]; kironSetUp: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ text: string; good: boolean } | null>(null);
  const [pending, start] = useTransition();
  const groups = teams.filter((t) => t.kind === "group");
  const departments = teams.filter((t) => t.kind === "department");

  function run(fn: () => Promise<Result>, after?: () => void) {
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? (res.message ? { text: res.message, good: true } : null) : { text: res.error ?? "Something went wrong.", good: false });
      if (res.ok) after?.();
      router.refresh();
    });
  }

  return (
    <section className="card p-5" aria-label="Departments and groups">
      <h2 className="h2 mb-1">Departments &amp; groups</h2>
      <p className="mb-4 text-sm text-muted">
        Departments come from the organogram. Groups are people with a job in KRM, like signing off a deal&rsquo;s technical review.
        Add a backup to a group for when someone is away: everyone in the group is told when a deal is waiting.
      </p>

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg bg-paper p-4">
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-bold">{kironSetUp ? "Kiron's people are set up" : "Set up Kiron's people"}</p>
          <p className="text-muted">
            {kironSetUp
              ? "Run it again any time: it only adds people and departments that are missing, and never changes anyone's role."
              : "Adds the 20 departments and 117 people from the organogram (names and job titles, no emails), with a starting role by department, and the technical reviewers group."}
          </p>
        </div>
        <button className={kironSetUp ? "btn-ghost" : "btn-primary"} disabled={pending} onClick={() => run(() => applyKironOrgAction())}>
          {kironSetUp ? "Add anyone missing" : "Set up Kiron's people"}
        </button>
      </div>

      {groups.length > 0 && <TeamList title="Groups" teams={groups} people={people} pending={pending} run={run} />}
      {departments.length > 0 && <TeamList title="Departments" teams={departments} people={people} pending={pending} run={run} />}

      <form
        className="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-paper p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createTeamAction({ name, kind: "group" }), () => setName(""));
        }}
      >
        <div className="min-w-0 flex-1">
          <label className="label" htmlFor="new-group">New group</label>
          <input id="new-group" className="input" placeholder="e.g. Go-live: Finance" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn-primary" disabled={pending || !name.trim()}>Add group</button>
      </form>
      {msg && <p className={`mt-3 text-sm ${msg.good ? "text-brand-dark" : "text-danger"}`} role={msg.good ? "status" : "alert"}>{msg.text}</p>}
    </section>
  );
}

function TeamList({ title, teams, people, pending, run }: { title: string; teams: Team[]; people: Option[]; pending: boolean; run: (fn: () => Promise<Result>) => void }) {
  return (
    <div className="mb-4">
      <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{title}</h3>
      <ul className="space-y-2">
        {teams.map((t) => <TeamRow key={t.id} t={t} people={people} pending={pending} run={run} />)}
      </ul>
    </div>
  );
}

function TeamRow({ t, people, pending, run }: { t: Team; people: Option[]; pending: boolean; run: (fn: () => Promise<Result>) => void }) {
  const [adding, setAdding] = useState<string | null>(null);
  const memberIds = new Set(t.members.map((m) => m.id));
  return (
    <li>
      <details className="rounded-lg border border-line" open={t.kind === "group"}>
        <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
          <span className="font-bold">{t.name}</span>
          <span className="text-xs text-muted">{t.members.length} {t.members.length === 1 ? "person" : "people"}</span>
          {t.seesCommercials && <span className="rounded-full bg-brand-soft px-2 text-xs font-bold text-brand-dark">Sees fees &amp; rates</span>}
          {t.fields.length > 0 && <span className="rounded-full bg-warn-soft px-2 text-xs font-bold text-warn">Signs off: {t.fields.join(", ")}</span>}
        </summary>
        <div className="space-y-3 border-t border-line p-3">
          {t.members.length === 0 ? <p className="text-sm text-muted">Nobody yet.</p> : (
            <ul className="flex flex-wrap gap-2">
              {t.members.map((m) => (
                <li key={m.id} className="flex items-center gap-1 rounded-full border border-line bg-white py-0.5 pr-1 pl-3 text-sm" title={m.title ?? undefined}>
                  {m.name}
                  <button
                    className="rounded-full px-1.5 text-muted hover:bg-paper hover:text-danger"
                    aria-label={`Take ${m.name} out of ${t.name}`}
                    disabled={pending}
                    onClick={() => run(() => setTeamMemberAction(t.id, m.id, false))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-56 flex-1 sm:max-w-sm">
              <SearchSelect options={people.filter((p) => !memberIds.has(p.id))} value={adding} onChange={setAdding} placeholder={`Add someone to ${t.name}`} />
            </div>
            <button className="btn-dark" disabled={pending || !adding} onClick={() => { const id = adding!; setAdding(null); run(() => setTeamMemberAction(t.id, id, true)); }}>Add</button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={t.seesCommercials} disabled={pending} onChange={(e) => run(() => updateTeamAction(t.id, { seesCommercials: e.target.checked }))} />
              Can see fees and rates
            </label>
            {t.members.length === 0 && (
              <button className="text-xs font-bold text-muted hover:text-danger" disabled={pending} onClick={() => run(() => deleteTeamAction(t.id))}>Remove {t.kind}</button>
            )}
          </div>
        </div>
      </details>
    </li>
  );
}
