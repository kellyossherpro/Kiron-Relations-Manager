"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { movePriorityAction, setPriorityAction } from "@/app/actions";
import { SearchSelect, type Option } from "./search-select";

type Result = { ok: boolean; error?: string };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<Result>) => start(async () => {
    const res = await fn();
    setMsg(res.ok ? null : (res.error ?? "Something went wrong."));
    router.refresh();
  });
  return { pending, msg, run };
}

// Up, down and remove on one row of the Priorities board.
export function PriorityRowControls({ dealId, name, first, last }: { dealId: string; name: string; first: boolean; last: boolean }) {
  const { pending, msg, run } = useRun();
  const btn = "grid h-8 w-8 place-items-center rounded-lg border border-line bg-white text-sm font-bold hover:border-ink disabled:opacity-30";
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" className={btn} disabled={pending || first} aria-label={`Move ${name} up`} title="Move up" onClick={() => run(() => movePriorityAction(dealId, "up"))}>↑</button>
      <button type="button" className={btn} disabled={pending || last} aria-label={`Move ${name} down`} title="Move down" onClick={() => run(() => movePriorityAction(dealId, "down"))}>↓</button>
      <button type="button" className={`${btn} text-muted hover:text-danger`} disabled={pending} aria-label={`Take ${name} off the list`} title="Take off the list" onClick={() => run(() => setPriorityAction(dealId, null))}>×</button>
      {msg && <span className="text-xs text-danger" role="alert">{msg}</span>}
    </span>
  );
}

// "Add a deal": pick one without a priority and a free number (the next free one by default).
export function PriorityAdd({ deals, taken }: { deals: Option[]; taken: number[] }) {
  const { pending, msg, run } = useRun();
  const free = Array.from({ length: Math.max(20, Math.max(0, ...taken) + 10) }, (_, i) => i + 1).filter((n) => !taken.includes(n));
  const [deal, setDeal] = useState<string | null>(null);
  const [n, setN] = useState<number>(free[0]);
  const number = free.includes(n) ? n : free[0];
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg bg-paper p-4">
      <div className="min-w-56 flex-1">
        <label className="label" htmlFor="priority-deal">Add a deal</label>
        <SearchSelect id="priority-deal" options={deals} value={deal} onChange={setDeal} placeholder="Type a deal name" />
      </div>
      <div>
        <label className="label" htmlFor="priority-number">At priority</label>
        <select id="priority-number" className="input w-28" value={number} onChange={(e) => setN(Number(e.target.value))}>
          {free.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>
      <button className="btn-primary" disabled={pending || !deal} onClick={() => { const d = deal!; setDeal(null); run(() => setPriorityAction(d, number)); }}>Add to priorities</button>
      {msg && <p className="w-full text-sm text-danger" role="alert">{msg}</p>}
    </div>
  );
}
