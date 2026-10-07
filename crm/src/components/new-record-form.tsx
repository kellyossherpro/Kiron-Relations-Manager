"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createRecordAction } from "@/app/actions";
import type { ObjectType } from "@/db/schema";
import { FieldInput, type ClientField, type Lookups } from "./field-input";

const PATHS: Record<ObjectType, string> = { company: "/companies", contact: "/contacts", deal: "/deals" };

export function NewRecordForm({ objectType, fields, lookups, submitLabel, initial = {} }: { objectType: ObjectType; fields: ClientField[]; lookups: Lookups; submitLabel: string; initial?: Record<string, unknown> }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== "" && v !== null && v !== undefined));
      const res = await createRecordAction(objectType, clean);
      if (res.ok) router.push(`${PATHS[objectType]}/${res.id}`);
      else setError({ message: res.error, field: res.field });
    });
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      {fields.map((f) => (
        <div key={f.key}>
          <label className="label" htmlFor={`f-${f.key}`}>{f.label}{f.required && " *"}</label>
          <FieldInput field={f} value={values[f.key]} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} lookups={lookups} invalid={error?.field === f.key} />
          {error?.field === f.key && <p className="mt-1 text-xs text-danger">{error.message}</p>}
        </div>
      ))}
      {error && !fields.some((f) => f.key === error.field) && <p className="text-sm text-danger" role="alert">{error.message}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
        <button type="button" className="btn-ghost" onClick={() => router.back()}>Cancel</button>
      </div>
    </form>
  );
}
