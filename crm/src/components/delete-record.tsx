"use client";

import { useState, useTransition } from "react";
import { deleteRecordAction } from "@/app/actions";
import type { ObjectType } from "@/db/schema";

export function DeleteRecord({ objectType, id, label }: { objectType: ObjectType; id: string; label: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!confirming) return <button className="btn-danger" onClick={() => setConfirming(true)}>Delete</button>;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-danger-soft p-2 text-sm">
      <span>Delete this {label}? It can be restored for 30 days.</span>
      <button
        className="btn-danger"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await deleteRecordAction(objectType, id);
            if (res && !res.ok) setError(res.error);
          })
        }
      >
        {pending ? "Deleting…" : "Yes, delete"}
      </button>
      <button className="btn-ghost" onClick={() => setConfirming(false)}>Keep it</button>
      {error && <span className="text-danger">{error}</span>}
    </div>
  );
}
