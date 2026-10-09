"use client";

import { useState } from "react";
import { signInAction } from "@/app/actions";

type P = { id: string; name: string; title: string | null; role: string };

// The test version's "pick who you are", with a search box once there are many people.
export function PeopleList({ people, roleLabels }: { people: P[]; roleLabels: Record<string, string> }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const shown = term ? people.filter((p) => `${p.name} ${p.title ?? ""}`.toLowerCase().includes(term)) : people;
  return (
    <>
      {people.length > 8 && (
        <>
          <label htmlFor="who" className="sr-only">Find your name</label>
          <input id="who" className="input" placeholder="Type your name" autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
        </>
      )}
      <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
        {shown.map((u) => (
          <li key={u.id}>
            <form action={signInAction.bind(null, u.id)}>
              <button className="btn-ghost w-full justify-between text-left">
                <span>
                  {u.name}
                  {u.title && <span className="block text-xs font-normal text-muted">{u.title}</span>}
                </span>
                <span className="text-xs font-semibold text-muted">{roleLabels[u.role] ?? u.role}</span>
              </button>
            </form>
          </li>
        ))}
        {shown.length === 0 && <li className="text-sm text-muted">Nobody called &ldquo;{q}&rdquo;.</li>}
      </ul>
    </>
  );
}
