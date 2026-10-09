"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setPriorityAction } from "@/app/actions";

// Picks a deal's priority. Numbers other deals have are shown but can't be picked.
export function PriorityPicker({ dealId, current, taken, compact = false }: {
  dealId: string;
  current: number | null;
  taken: Record<number, string>; // number → the other deal's name
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const highest = Math.max(0, current ?? 0, ...Object.keys(taken).map(Number));
  const numbers = Array.from({ length: Math.max(20, highest + 10) }, (_, i) => i + 1);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label className={compact ? "sr-only" : "text-xs font-bold tracking-wide text-muted uppercase"} htmlFor={`priority-${dealId}`}>Priority</label>
      <select
        id={`priority-${dealId}`}
        className="input w-auto py-1"
        value={current ?? ""}
        disabled={pending}
        onChange={(e) => start(async () => {
          const res = await setPriorityAction(dealId, e.target.value ? Number(e.target.value) : null);
          setMsg(res.ok ? null : res.error);
          router.refresh();
        })}
      >
        <option value="">No priority</option>
        {numbers.map((n) => {
          const other = n !== current ? taken[n] : undefined;
          return <option key={n} value={n} disabled={!!other}>{other ? `${n} · taken by ${other}` : String(n)}</option>;
        })}
      </select>
      {msg && <span className="text-xs text-danger" role="alert">{msg}</span>}
    </span>
  );
}
