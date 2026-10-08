"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setGoLiveTeamsAction } from "@/app/actions";

type Slot = { slot: string; label: string; teamId: string | null };

// Which department confirms each go-live handover. Dev is split by the deal's platform; deals on
// another platform (3rd Party, Mobile Lite) can be confirmed by either dev team.
export function AdminGoLive({ slots, teams }: { slots: Slot[]; teams: { id: string; name: string }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card p-5" aria-label="Go-live handovers">
      <h2 className="h2 mb-1">Go-live handovers</h2>
      <p className="mb-4 text-sm text-muted">
        Who confirms each handover on a won deal. Everyone in the department is told when a deal is ready, and the deal goes Live once all four have confirmed.
        Deals on other platforms (3rd Party, Mobile Lite) can be confirmed by either dev team.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slots.map((s) => (
          <div key={s.slot}>
            <label className="label" htmlFor={`golive-${s.slot}`}>{s.label}</label>
            <select
              id={`golive-${s.slot}`}
              className="input"
              value={s.teamId ?? ""}
              disabled={pending}
              onChange={(e) => start(async () => {
                const res = await setGoLiveTeamsAction({ [s.slot]: e.target.value || null });
                setMsg(res.ok ? null : res.error);
                router.refresh();
              })}
            >
              <option value="">Nobody yet (only admins)</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        ))}
      </div>
      {msg && <p className="mt-3 text-sm text-danger" role="alert">{msg}</p>}
    </section>
  );
}
