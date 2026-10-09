"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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

// How long after the last change a field saves itself: typed fields wait until the person pauses
// (or clicks away); picked answers save straight away.
const WAIT: Partial<Record<ClientField["type"], number>> = { text: 1000, textarea: 1000, number: 1000, money: 1000, url: 1000, email: 1000, date: 1000, multiselect: 400 };

/**
 * Shows a record's fields and lets people edit them. Every change saves itself, one field at a
 * time, sending what the field looked like when it was last saved. If someone else changed the
 * same field meanwhile, nothing is saved and the person picks whose value to keep.
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
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({}); // field → why it didn't save
  const [general, setGeneral] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  const draftRef = useRef(draft);
  const baseRef = useRef<Record<string, unknown>>(values); // what each field was when it last saved
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const queue = useRef<Promise<void>>(Promise.resolve());
  const conflictsRef = useRef<Conflict[]>([]);
  useEffect(() => { conflictsRef.current = conflicts; }, [conflicts]);

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

  // "Changes saved" fades away by itself.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // Leaving the page with a change still waiting to save: save it first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (Object.keys(timers.current).length || saving) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);

  function beginEdit() {
    draftRef.current = values;
    baseRef.current = values;
    setDraft(values);
    setConflicts([]);
    setErrors({});
    setGeneral(null);
    setEditing(true);
  }

  function change(f: ClientField, v: unknown) {
    draftRef.current = { ...draftRef.current, [f.key]: v };
    setDraft(draftRef.current);
    clearTimeout(timers.current[f.key]);
    const wait = WAIT[f.type] ?? 0;
    if (wait) timers.current[f.key] = setTimeout(() => saveNow(f.key), wait);
    else saveNow(f.key);
  }

  // Saves one field (in order, one at a time), unless it's unchanged or waiting on a conflict.
  function saveNow(key: string) {
    clearTimeout(timers.current[key]);
    delete timers.current[key];
    queue.current = queue.current.then(() => saveField(key));
    return queue.current;
  }

  async function saveField(key: string) {
    const value = draftRef.current[key] ?? null;
    const base = baseRef.current[key] ?? null;
    if (same(value, base) || conflictsRef.current.some((c) => c.field === key)) return;
    setSaving((n) => n + 1);
    try {
      const res = await saveRecordAction(objectType, recordId, { [key]: value }, { [key]: base });
      if (res.status === "saved") {
        baseRef.current = { ...baseRef.current, [key]: value };
        setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)));
        setGeneral(null);
        setToast((t) => ({
          text: res.movedTo?.length ? "Changes saved. Everything for this stage is in, so the deal moved on." : "Changes saved",
          n: (t?.n ?? 0) + 1,
        }));
        router.refresh();
      } else if (res.status === "conflict") {
        setConflicts((cs) => [...cs.filter((c) => !res.conflicts.some((x) => x.field === c.field)), ...res.conflicts]);
      } else if (res.field && fields.some((f) => f.key === res.field)) {
        setErrors((e) => ({ ...e, [res.field!]: res.error }));
      } else {
        setGeneral(res.error);
      }
    } catch {
      setGeneral("Not saved: check your connection. Your change is still here; change the field again to retry.");
    } finally {
      setSaving((n) => n - 1);
    }
  }

  async function done() {
    await Promise.all(Object.keys(timers.current).map((k) => saveNow(k)));
    await queue.current;
    setEditing(false);
  }

  // "Keep mine": what's stored now becomes the base and my value saves. "Use theirs": take theirs.
  function resolve(c: Conflict, keep: "mine" | "theirs") {
    baseRef.current = { ...baseRef.current, [c.field]: c.theirs };
    conflictsRef.current = conflictsRef.current.filter((x) => x.field !== c.field);
    setConflicts(conflictsRef.current);
    if (keep === "theirs") {
      draftRef.current = { ...draftRef.current, [c.field]: c.theirs };
      setDraft(draftRef.current);
    } else {
      queue.current = queue.current.then(() => saveField(c.field));
    }
  }

  const fieldOf = (key: string) => fields.find((f) => f.key === key)!;
  const waiting = conflicts.length > 0 || Object.keys(errors).length > 0;

  function renderGroup(g: { name: string | null; fields: ClientField[] }) {
    return (
      <div key={g.name ?? "_main"}>
        {g.name && <h3 className="mb-3 border-b border-line pb-1 text-xs font-black tracking-wider text-muted uppercase">{g.name}</h3>}
        <dl className="grid gap-x-6 gap-y-4 @lg:grid-cols-2">
          {g.fields.map((f) => (
            <div key={f.key} className="min-w-0">
              <dt>
                <label className="label" htmlFor={`f-${f.key}`}>
                  {f.label}
                  {f.required && editing && " *"}
                </label>
              </dt>
              <dd className="text-sm" onBlur={editing && f.editable ? () => { if (timers.current[f.key]) saveNow(f.key); } : undefined}>
                {editing && f.editable ? (
                  <FieldInput field={f} value={draft[f.key]} onChange={(v) => change(f, v)} lookups={lookups} invalid={!!errors[f.key]} />
                ) : (
                  <FieldValue field={f} value={values[f.key]} lookups={lookups} />
                )}
                {errors[f.key] && <p className="mt-1 text-xs text-danger">{errors[f.key]} Not saved yet.</p>}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <section className="card @container p-5" aria-label="Details">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="h2">Details</h2>
        <div className="flex items-center gap-3">
          {editing && (
            <span className="text-xs font-bold text-muted" aria-live="polite">
              {saving > 0 ? "Saving…" : waiting ? "" : "Changes save by themselves"}
            </span>
          )}
          {!editing && canEdit && <button className="btn-ghost shrink-0" onClick={beginEdit}>Edit</button>}
          {editing && <button className="btn-primary shrink-0" onClick={done}>Done</button>}
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="mb-5 rounded-lg border border-warn/40 bg-warn-soft p-4" role="alert">
          <p className="font-bold text-warn">Someone else changed {conflicts.length === 1 ? "this field" : "these fields"} while you were editing.</p>
          <p className="mb-3 text-sm text-ink">Your change to {conflicts.length === 1 ? "it" : "them"} isn&rsquo;t saved yet. Choose which value to keep.</p>
          <ul className="space-y-3">
            {conflicts.map((c) => (
              <li key={c.field} className="rounded-lg bg-white p-3">
                <p className="text-sm font-bold">{c.label}</p>
                <div className="mt-1 grid gap-1 text-sm @md:grid-cols-2">
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
      {general && <p className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{general}</p>}

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

      {toast && (
        <div key={toast.n} role="status" className="fixed right-4 bottom-4 z-50 flex max-w-sm items-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-bold text-white shadow-lg" style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-xs text-ink" aria-hidden="true">✓</span>
          {toast.text}
        </div>
      )}
    </section>
  );
}
