"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { saveRecordAction } from "@/app/actions";
import type { ObjectType } from "@/db/schema";
import { isShown } from "@/lib/conditions";
import type { Conflict } from "@/lib/records";
import { FieldInput, FieldValue, type ClientField, type Lookups } from "./field-input";

function same(a: unknown, b: unknown) {
  const n = (v: unknown) => (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0) ? null : JSON.stringify(v));
  const na = n(a);
  const nb = n(b);
  if (na === nb) return true;
  return na !== null && nb !== null && !Number.isNaN(Number(a)) && !Number.isNaN(Number(b)) && Number(a) === Number(b);
}

/**
 * Shows a record's fields and lets people edit them. Saving sends only the fields
 * that changed, plus what each looked like when editing started. If someone else
 * changed one of the same fields meanwhile, nothing is saved and the person picks,
 * field by field, whose value to keep.
 */
export function RecordFields({
  objectType,
  recordId,
  fields,
  values,
  lookups,
  laterGroups = [],
}: {
  objectType: ObjectType;
  recordId: string;
  fields: ClientField[];
  values: Record<string, unknown>;
  lookups: Lookups;
  laterGroups?: string[]; // sections for stages the deal hasn't reached: folded away
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>(values);
  const [base, setBase] = useState<Record<string, unknown>>(values);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const canEdit = fields.some((f) => f.editable);
  // Fields that only apply for certain answers follow what's on screen right now.
  const current = editing ? draft : values;
  const groups = useMemo(() => {
    const out: { name: string | null; fields: ClientField[] }[] = [];
    for (const f of fields.filter((x) => isShown(x, current))) {
      const name = f.group ?? null;
      let g = out.find((x) => x.name === name);
      if (!g) out.push((g = { name, fields: [] }));
      g.fields.push(f);
    }
    return out;
  }, [fields, current]);
  const now = groups.filter((g) => !g.name || !laterGroups.includes(g.name));
  const later = groups.filter((g) => g.name && laterGroups.includes(g.name));

  function beginEdit() {
    setDraft(values);
    setBase(values);
    setConflicts([]);
    setError(null);
    setSaved(null);
    setEditing(true);
  }

  function save() {
    const changes: Record<string, unknown> = {};
    const baseFor: Record<string, unknown> = {};
    for (const f of fields) {
      if (!f.editable) continue;
      if (!same(draft[f.key], base[f.key])) {
        changes[f.key] = draft[f.key] ?? null;
        baseFor[f.key] = base[f.key] ?? null;
      }
    }
    if (Object.keys(changes).length === 0) {
      setEditing(false);
      return;
    }
    start(async () => {
      setError(null);
      const res = await saveRecordAction(objectType, recordId, changes, baseFor);
      if (res.status === "saved") {
        setEditing(false);
        setConflicts([]);
        setSaved(res.movedTo?.length ? "Saved. Everything needed for this stage is filled in, so the deal moved on." : "Saved");
        router.refresh();
      } else if (res.status === "conflict") {
        setConflicts(res.conflicts);
      } else {
        setError({ message: res.error, field: res.field });
      }
    });
  }

  // "Keep mine": my value stays in the draft; the base becomes what's stored now, so
  // the next save goes through. "Use theirs": take their value and drop my change.
  function resolve(c: Conflict, keep: "mine" | "theirs") {
    setBase((b) => ({ ...b, [c.field]: c.theirs }));
    if (keep === "theirs") setDraft((d) => ({ ...d, [c.field]: c.theirs }));
    setConflicts((cs) => cs.filter((x) => x.field !== c.field));
  }

  const fieldOf = (key: string) => fields.find((f) => f.key === key)!;

  function renderGroup(g: { name: string | null; fields: ClientField[] }) {
    return (
      <div key={g.name ?? "_main"}>
        {g.name && <h3 className="mb-3 border-b border-line pb-1 text-xs font-black tracking-wider text-muted uppercase">{g.name}</h3>}
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {g.fields.map((f) => (
            <div key={f.key} className="min-w-0">
              <dt>
                <label className="label" htmlFor={`f-${f.key}`}>
                  {f.label}
                  {f.required && editing && " *"}
                </label>
              </dt>
              <dd className="text-sm">
                {editing && f.editable ? (
                  <FieldInput field={f} value={draft[f.key]} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} lookups={lookups} invalid={error?.field === f.key} />
                ) : (
                  <FieldValue field={f} value={values[f.key]} lookups={lookups} />
                )}
                {error?.field === f.key && <p className="mt-1 text-xs text-danger">{error.message}</p>}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <section className="card p-5" aria-label="Details">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="h2">Details</h2>
        <div className="flex items-center gap-3">
          {!editing && saved && <span className="text-right text-xs font-bold text-brand-dark" role="status">{saved}</span>}
          {!editing && canEdit && (
            <button className="btn-ghost shrink-0" onClick={beginEdit}>Edit</button>
          )}
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="mb-5 rounded-lg border border-warn/40 bg-warn-soft p-4" role="alert">
          <p className="font-bold text-warn">Someone else changed {conflicts.length === 1 ? "this field" : "these fields"} while you were editing.</p>
          <p className="mb-3 text-sm text-ink">Nothing has been saved yet. Choose which value to keep, then save again.</p>
          <ul className="space-y-3">
            {conflicts.map((c) => (
              <li key={c.field} className="rounded-lg bg-white p-3">
                <p className="text-sm font-bold">{c.label}</p>
                <div className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
                  <p>Theirs: <strong><FieldValue field={fieldOf(c.field)} value={c.theirs} lookups={lookups} /></strong></p>
                  <p>Yours: <strong><FieldValue field={fieldOf(c.field)} value={c.yours} lookups={lookups} /></strong></p>
                </div>
                <div className="mt-2 flex gap-2">
                  <button className="btn-ghost" onClick={() => resolve(c, "theirs")}>Use theirs</button>
                  <button className="btn-dark" onClick={() => resolve(c, "mine")}>Keep mine</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-6">
        {now.map((g) => renderGroup(g))}
        {later.length > 0 && (
          <details className="rounded-lg border border-line px-4 py-3">
            <summary className="cursor-pointer text-sm font-bold">
              Later stages <span className="font-normal text-muted">· {later.map((g) => g.name).join(", ")}</span>
            </summary>
            <div className="mt-4 space-y-6">{later.map((g) => renderGroup(g))}</div>
          </details>
        )}
      </div>


      {editing && (
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button className="btn-primary" onClick={save} disabled={pending || conflicts.length > 0}>
            {pending ? "Saving…" : "Save changes"}
          </button>
          <button className="btn-ghost" onClick={() => setEditing(false)} disabled={pending}>Cancel</button>
          {error && !error.field && <p className="text-sm text-danger">{error.message}</p>}
          {error?.field && !fields.some((f) => f.key === error.field) && <p className="text-sm text-danger">{error.message}</p>}
        </div>
      )}
    </section>
  );
}
