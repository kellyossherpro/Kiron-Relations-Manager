"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelAddendumAction, finishAddendumAction, raiseAddendumAction } from "@/app/actions";
import { ADDENDUM_TYPE_HINT, ADDENDUM_TYPE_LABEL, date, plural } from "@/lib/format";

export type AddendumView = {
  id: string;
  type: string;
  details: string;
  fromStage: string;
  status: "open" | "done" | "cancelled";
  raisedByName: string | null;
  raisedAt: string;
  closedByName: string | null;
  closedAt: string | null;
  closeNote: string | null;
  daysOpen: number;
};

type Result = { ok: boolean; error?: string; field?: string };

/**
 * The addendum loop on a deal: raise one on a live deal (type + details), then the
 * account management team marks it done and the deal goes back to Live by itself.
 */
export function AddendumPanel({
  dealId,
  isLive,
  liveLabel,
  stageLabels,
  canRaise,
  canFinish,
  items,
}: {
  dealId: string;
  isLive: boolean;
  liveLabel: string;
  stageLabels: Record<string, string>;
  canRaise: boolean;
  canFinish: boolean;
  items: AddendumView[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"idle" | "raise" | "done" | "cancel">("idle");
  const [type, setType] = useState("");
  const [details, setDetails] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ text: string; field?: string } | null>(null);
  const open = items.find((a) => a.status === "open");
  const past = items.filter((a) => a.status !== "open");

  function run(fn: () => Promise<Result>) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setMode("idle");
        setType("");
        setDetails("");
        setNote("");
        setMsg(null);
      } else setMsg({ text: res.error ?? "Something went wrong.", field: res.field });
      router.refresh();
    });
  }

  function show(m: typeof mode) {
    setMsg(null);
    setNote("");
    setMode(m);
  }

  return (
    <section className={`card @container p-5 ${open ? "ring-2 ring-warn/50" : ""}`} aria-label="Addendums">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="h2">Addendums</h2>
        {isLive && !open && canRaise && mode !== "raise" && (
          <button className="btn-dark" onClick={() => show("raise")}>Raise an addendum</button>
        )}
      </div>

      {isLive && !open && mode !== "raise" && past.length === 0 && (
        <p className="mt-2 text-sm text-muted">
          When this client changes something to do with money or the contract, raise an addendum here. The deal moves to Addendum and comes back
          to {liveLabel} once it&rsquo;s done.
        </p>
      )}

      {mode === "raise" && (
        <div className="mt-4 space-y-4">
          <p className="rounded-lg bg-paper p-3 text-sm">
            <strong>Only for changes to money or the contract.</strong> Operational changes (a new contact, updated support details, IP
            whitelisting, a small config tweak) don&rsquo;t need an addendum: add a task instead.
          </p>
          <fieldset>
            <legend className="label">What kind of change?</legend>
            <div className="grid gap-2 @md:grid-cols-2">
              {Object.keys(ADDENDUM_TYPE_LABEL).map((t) => (
                <label key={t} className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm ${type === t ? "border-brand bg-brand-soft/60" : "border-line"}`}>
                  <input type="radio" name="addendum-type" value={t} checked={type === t} onChange={() => setType(t)} className="mt-1 accent-brand" />
                  <span>
                    <span className="block font-bold">{ADDENDUM_TYPE_LABEL[t]}</span>
                    <span className="block text-xs text-muted">{ADDENDUM_TYPE_HINT[t]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="addendum-details">What exactly is changing?</label>
            <textarea id="addendum-details" className="input" rows={3} value={details} onChange={(e) => setDetails(e.target.value)}
              placeholder="e.g. Revenue share goes from 10% to 12% from 1 March" aria-invalid={msg?.field === "details"} />
          </div>
          <p className="text-xs text-muted">The deal moves to Addendum straight away. It comes back to {liveLabel} when the addendum is marked as done.</p>
          {msg && <p className="text-sm text-danger" role="alert">{msg.text}</p>}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={pending || !type || !details.trim()} onClick={() => run(() => raiseAddendumAction(dealId, { type, details }))}>
              {pending ? "Raising…" : "Raise addendum"}
            </button>
            <button className="btn-ghost" disabled={pending} onClick={() => show("idle")}>Cancel</button>
          </div>
        </div>
      )}

      {open && (
        <div className="mt-4 rounded-lg border border-warn/40 bg-warn-soft p-4">
          <p className="text-xs font-black tracking-wider text-warn uppercase">In progress</p>
          <p className="mt-1 font-bold">{ADDENDUM_TYPE_LABEL[open.type] ?? open.type}</p>
          <p className="mt-1 text-sm whitespace-pre-line">{open.details}</p>
          <p className="mt-2 text-xs text-muted">
            Raised by {open.raisedByName ?? "someone"} on {date(open.raisedAt)} · {open.daysOpen === 0 ? "today" : `${plural(open.daysOpen, "day")} ago`}
          </p>

          {canFinish && mode === "idle" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => show("done")}>Mark as done</button>
              <button className="btn-ghost" onClick={() => show("cancel")}>Cancel addendum</button>
            </div>
          )}
          {(mode === "done" || mode === "cancel") && (
            <div className="mt-3 space-y-2 border-t border-warn/30 pt-3">
              <label className="label" htmlFor="addendum-note">
                {mode === "done" ? "Anything to note? (optional, kept in the history)" : "Why is it being cancelled? (kept in the history)"}
              </label>
              <textarea id="addendum-note" className="input bg-white" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              {msg && <p className="text-sm text-danger" role="alert">{msg.text}</p>}
              <div className="flex flex-wrap gap-2">
                {mode === "done" ? (
                  <button className="btn-primary" disabled={pending} onClick={() => run(() => finishAddendumAction(open.id, note))}>
                    {pending ? "Saving…" : `Done: back to ${stageLabels[open.fromStage] ?? liveLabel}`}
                  </button>
                ) : (
                  <button className="btn-dark" disabled={pending || !note.trim()} onClick={() => run(() => cancelAddendumAction(open.id, note))}>
                    {pending ? "Saving…" : "Cancel addendum"}
                  </button>
                )}
                <button className="btn-ghost" disabled={pending} onClick={() => show("idle")}>Back</button>
              </div>
            </div>
          )}
          {!canFinish && <p className="mt-3 text-xs text-muted">The account management team marks it as done, and the deal goes back to {stageLabels[open.fromStage] ?? liveLabel} by itself.</p>}
        </div>
      )}

      {mode === "idle" && msg && <p className="mt-3 text-sm text-danger" role="alert">{msg.text}</p>}

      {past.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-black tracking-wider text-muted uppercase">Past addendums</h3>
          <ul className="space-y-2">
            {past.map((a) => (
              <li key={a.id} className="rounded-md bg-paper px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`pill ${a.status === "done" ? "bg-brand text-ink" : "bg-line text-ink"}`}>{a.status === "done" ? "Done" : "Cancelled"}</span>
                  <strong>{ADDENDUM_TYPE_LABEL[a.type] ?? a.type}</strong>
                  <span className="text-xs text-muted">{date(a.raisedAt)} → {date(a.closedAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-line">{a.details}</p>
                <p className="mt-1 text-xs text-muted">
                  Raised by {a.raisedByName ?? "someone"} · {a.status === "done" ? "done" : "cancelled"} by {a.closedByName ?? "someone"}
                  {a.closeNote && <> · &ldquo;{a.closeNote}&rdquo;</>}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
