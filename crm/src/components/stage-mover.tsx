"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveStageAction } from "@/app/actions";

type Stage = { key: string; label: string; kind: string };

// Shows where the deal is in the pipeline. Managers can move it anywhere; owners
// can park or close it. Every manual move needs a reason, which goes in the history.
export function StageMover({ dealId, current, stages, allowed, checklist, nextLabel }: { dealId: string; current: string; stages: Stage[]; allowed: string[]; checklist: { id: string; label: string; met: boolean }[]; nextLabel: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const path = stages.filter((s) => ["open", "won", "live"].includes(s.kind) && s.key !== "live_aggregator");
  const currentStage = stages.find((s) => s.key === current);
  const currentIndex = path.findIndex((s) => s.key === current);
  const choices = stages.filter((s) => allowed.includes(s.key) && s.key !== current);

  function submit() {
    start(async () => {
      const res = await moveStageAction(dealId, to, current, reason);
      if ("error" in res) setMsg(res.error);
      else if (res.status === "moved" || res.status === "unchanged") {
        setOpen(false);
        setReason("");
        setTo("");
        setMsg(null);
        router.refresh();
      } else if (res.status === "conflict") {
        setMsg("Someone moved this deal while you were looking. The page has been refreshed; check the stage and try again.");
        router.refresh();
      }
    });
  }

  return (
    <section className="card p-5" aria-label="Stage">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">Stage</p>
          <p className="text-lg font-black uppercase">{currentStage?.label ?? current}</p>
        </div>
        {choices.length > 0 && !open && (
          <button className="btn-ghost" onClick={() => setOpen(true)}>Move deal</button>
        )}
      </div>
      <ol className="mt-4 flex gap-1" aria-label="Pipeline">
        {path.map((s, i) => (
          <li key={s.key} className="flex-1" title={s.label}>
            <div className={`h-2 rounded-full ${currentIndex >= 0 && i <= currentIndex ? "bg-brand" : "bg-line"}`} />
            <span className="sr-only">{s.label}{s.key === current ? " (current)" : ""}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4">
        {checklist.length === 0 ? (
          <p className="text-sm text-muted">No rules for this stage yet, so the deal only moves when someone moves it.</p>
        ) : (
          <>
            <p className="mb-2 text-sm font-bold">
              {checklist.every((c) => c.met)
                ? nextLabel ? `Everything is filled in.` : "Everything is filled in. There's no next stage set, so move it by hand."
                : `Needed before it moves${nextLabel ? ` to ${nextLabel}` : " on"} (${checklist.filter((c) => !c.met).length} of ${checklist.length} left):`}
            </p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {checklist.map((c) => (
                <li key={c.id} className={`flex items-start gap-2 text-sm ${c.met ? "text-muted" : "font-semibold"}`}>
                  <span aria-hidden className={`mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${c.met ? "bg-brand text-ink" : "border-2 border-warn"}`}>{c.met ? "✓" : ""}</span>
                  <span>{c.label}<span className="sr-only">{c.met ? " (done)" : " (missing)"}</span></span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {currentIndex < 0 && currentStage && (
        <p className="mt-2 text-xs font-bold text-warn">This deal is out of the normal pipeline: {currentStage.label}.</p>
      )}
      {open && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div>
            <label className="label" htmlFor="move-to">Move to</label>
            <select id="move-to" className="input" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Choose a stage</option>
              {choices.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="move-reason">Reason (kept in the history)</label>
            <textarea id="move-reason" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {msg && <p className="text-sm text-danger" role="alert">{msg}</p>}
          <div className="flex gap-2">
            <button className="btn-dark" disabled={!to || !reason.trim() || pending} onClick={submit}>{pending ? "Moving…" : "Move deal"}</button>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
