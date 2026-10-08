"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmGoLiveAction, undoGoLiveAction } from "@/app/actions";
import type { CheckKey } from "@/lib/go-live-checks";
import { date } from "@/lib/format";

export type GoLiveCheckView = {
  key: CheckKey;
  label: string;
  teamNames: string;
  canConfirm: boolean;
  confirmed: { by: string; at: string; note: string | null } | null;
};

/**
 * Go-live on a won deal: Legal, Finance, Support and Dev each confirm their handover. When the last
 * one confirms (and everything else for Closed Won is in) the deal goes Live by itself.
 */
export function GoLivePanel({ dealId, checks, isWon, liveDate }: { dealId: string; checks: GoLiveCheckView[]; isWon: boolean; liveDate: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [noteFor, setNoteFor] = useState<CheckKey | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const done = checks.filter((c) => c.confirmed).length;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? null : (res.error ?? "Something went wrong."));
      if (res.ok) { setNoteFor(null); setNote(""); }
      router.refresh();
    });
  }

  return (
    <section className="card p-5" aria-label="Go-live">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="h2">Go-live handovers</h2>
        <span className={`text-sm font-bold tabular-nums ${done === checks.length ? "text-brand-dark" : "text-warn"}`}>{done} of {checks.length} confirmed</span>
      </div>
      {isWon && (
        <p className="mb-3 text-sm text-muted">
          {liveDate ? `Live date ${date(liveDate)}. ` : "No Live date yet. "}
          Each department confirms its handover; the deal goes Live once all {checks.length} have.
        </p>
      )}
      <ul className="divide-y divide-line">
        {checks.map((c) => (
          <li key={c.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${c.confirmed ? "bg-brand text-ink" : "bg-paper text-muted"}`} aria-hidden>
              {c.confirmed ? "✓" : c.label[0]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{c.label}</p>
              <p className="text-xs text-muted">
                {c.confirmed
                  ? <>Confirmed by {c.confirmed.by} on {date(c.confirmed.at)}{c.confirmed.note && <> · &ldquo;{c.confirmed.note}&rdquo;</>}</>
                  : `Waiting for ${c.teamNames}`}
              </p>
            </div>
            {isWon && c.canConfirm && !c.confirmed && noteFor !== c.key && (
              <button className="btn-primary" disabled={pending} onClick={() => { setNoteFor(c.key); setNote(""); }}>Confirm {c.label} handover</button>
            )}
            {isWon && c.canConfirm && c.confirmed && (
              <button className="text-xs font-bold text-muted hover:text-danger" disabled={pending} onClick={() => run(() => undoGoLiveAction(dealId, c.key))}>Undo</button>
            )}
            {noteFor === c.key && (
              <form
                className="flex w-full flex-wrap items-end gap-2 rounded-lg bg-paper p-3"
                onSubmit={(e) => { e.preventDefault(); run(() => confirmGoLiveAction(dealId, c.key, note)); }}
              >
                <div className="min-w-0 flex-1">
                  <label className="label" htmlFor={`golive-note-${c.key}`}>Note (optional)</label>
                  <input id={`golive-note-${c.key}`} className="input" placeholder="e.g. Billing set up from 1 December" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <button className="btn-primary" disabled={pending}>Confirm</button>
                <button type="button" className="btn-ghost" onClick={() => setNoteFor(null)}>Cancel</button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {msg && <p className="mt-3 text-sm text-danger" role="alert">{msg}</p>}
    </section>
  );
}
