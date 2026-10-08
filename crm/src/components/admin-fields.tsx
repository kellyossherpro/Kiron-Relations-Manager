"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createFieldAction, updateFieldAction } from "@/app/actions";
import type { FieldType, ObjectType } from "@/db/schema";

const TYPE_LABEL: Record<FieldType, string> = {
  text: "Short text", textarea: "Long text", number: "Number", money: "Money (USD)", date: "Date",
  select: "Dropdown (one choice)", multiselect: "Dropdown (several choices)", yesno: "Yes / No", url: "Website link", email: "Email address",
};
const OBJECT_LABEL: Record<ObjectType, string> = { deal: "Deals", company: "Companies", contact: "Contacts" };

type ShowWhen = { field: string; values: string[] } | null;
type Def = { id: string; objectType: ObjectType; key: string; label: string; type: FieldType; options: string[]; groupLabel: string | null; extraEditorRoles: string[]; showWhen?: ShowWhen; archived: boolean };
type SaveInput = { label?: string; options?: string[]; groupLabel?: string | null; extraEditorRoles?: string[]; showWhen?: ShowWhen; archived?: boolean };

const answersOf = (d: Def) => (d.type === "yesno" ? ["Yes", "No"] : d.options);

export function AdminFields({ defs }: { defs: Def[] }) {
  const router = useRouter();
  const [objectType, setObjectType] = useState<ObjectType>("deal");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [options, setOptions] = useState("");
  const [group, setGroup] = useState("");
  const [legal, setLegal] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const needsOptions = type === "select" || type === "multiselect";
  const list = defs.filter((d) => d.objectType === objectType);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? null : (res.error ?? "Something went wrong."));
      if (res.ok) after?.();
      router.refresh();
    });
  }

  return (
    <section className="card p-5" aria-label="Fields">
      <h2 className="h2 mb-1">Fields</h2>
      <p className="mb-4 text-sm text-muted">Add the fields your team fills in. New fields appear on every record straight away.</p>
      <div className="mb-4 flex gap-1 rounded-lg border border-line bg-white p-0.5 text-sm font-bold sm:w-fit" role="tablist">
        {(Object.keys(OBJECT_LABEL) as ObjectType[]).map((o) => (
          <button key={o} role="tab" aria-selected={objectType === o} className={`rounded-md px-3 py-1.5 ${objectType === o ? "bg-ink text-white" : ""}`} onClick={() => setObjectType(o)}>
            {OBJECT_LABEL[o]}
          </button>
        ))}
      </div>

      {list.length === 0 ? <p className="text-sm text-muted">No extra fields on {OBJECT_LABEL[objectType].toLowerCase()} yet. The built-in ones (name, owner and so on) are always there.</p> : (
        <ul className="space-y-2">
          {list.map((d) => (
            <FieldRow key={d.id} d={d} others={list.filter((o) => o.id !== d.id && !o.archived && ["select", "multiselect", "yesno"].includes(o.type))} pending={pending} onSave={(input) => run(() => updateFieldAction(d.id, input))} />
          ))}
        </ul>
      )}

      <form
        className="mt-5 space-y-3 rounded-lg bg-paper p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => createFieldAction({ objectType, label, type, options: options.split("\n"), groupLabel: group, extraEditorRoles: legal ? ["legal"] : [] }),
            () => { setLabel(""); setOptions(""); },
          );
        }}
      >
        <p className="text-sm font-bold">Add a field to {OBJECT_LABEL[objectType].toLowerCase()}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label" htmlFor="fd-label">Field name</label><input id="fd-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <div>
            <label className="label" htmlFor="fd-type">Type</label>
            <select id="fd-type" className="input" value={type} onChange={(e) => setType(e.target.value as FieldType)}>
              {(Object.keys(TYPE_LABEL) as FieldType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div><label className="label" htmlFor="fd-group">Section (optional)</label><input id="fd-group" className="input" placeholder="e.g. Commercials" value={group} onChange={(e) => setGroup(e.target.value)} /></div>
        </div>
        {needsOptions && (
          <div><label className="label" htmlFor="fd-options">Options, one per line</label><textarea id="fd-options" className="input" rows={4} value={options} onChange={(e) => setOptions(e.target.value)} /></div>
        )}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={legal} onChange={(e) => setLegal(e.target.checked)} /> Legal can edit this field on any deal</label>
        <button className="btn-primary" disabled={pending || !label.trim()}>Add field</button>
      </form>
      {msg && <p className="mt-3 text-sm text-danger" role="alert">{msg}</p>}
    </section>
  );
}

function FieldRow({ d, others, pending, onSave }: { d: Def; others: Def[]; pending: boolean; onSave: (input: SaveInput) => void }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(d.label);
  const [options, setOptions] = useState(d.options.join("\n"));
  const [group, setGroup] = useState(d.groupLabel ?? "");
  const [legal, setLegal] = useState(d.extraEditorRoles.includes("legal"));
  const [whenField, setWhenField] = useState(d.showWhen?.field ?? "");
  const [whenValues, setWhenValues] = useState<string[]>(d.showWhen?.values ?? []);
  const controller = others.find((o) => `p.${o.key}` === whenField);
  const controllerOf = (sw: ShowWhen | undefined) => others.find((o) => sw && `p.${o.key}` === sw.field)?.label;
  const hasOptions = d.type === "select" || d.type === "multiselect";
  return (
    <li className={`rounded-lg border border-line p-3 ${d.archived ? "opacity-50" : ""}`}>
      {!editing ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div>
            <span className="font-bold">{d.label}</span>
            <span className="ml-2 text-xs text-muted">{TYPE_LABEL[d.type]}{d.groupLabel ? ` · ${d.groupLabel}` : ""}{d.extraEditorRoles.includes("legal") ? " · Legal can edit" : ""}{d.archived ? " · Hidden" : ""}</span>
            {d.showWhen && <p className="text-xs text-muted">Only shown when {controllerOf(d.showWhen) ?? "another field"} is {d.showWhen.values.join(" or ")}</p>}
            {hasOptions && <p className="text-xs text-muted">{d.options.slice(0, 8).join(", ")}{d.options.length > 8 ? ` and ${d.options.length - 8} more` : ""}</p>}
          </div>
          <div className="flex gap-3 text-xs font-bold">
            <button className="text-brand-dark hover:underline" onClick={() => setEditing(true)}>Edit</button>
            <button className="text-muted hover:text-ink" disabled={pending} onClick={() => onSave({ archived: !d.archived })}>{d.archived ? "Show again" : "Hide"}</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="input" aria-label="Field name" value={label} onChange={(e) => setLabel(e.target.value)} />
            <input className="input" aria-label="Section" placeholder="Section" value={group} onChange={(e) => setGroup(e.target.value)} />
          </div>
          {hasOptions && <textarea className="input" aria-label="Options, one per line" rows={4} value={options} onChange={(e) => setOptions(e.target.value)} />}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={legal} onChange={(e) => setLegal(e.target.checked)} /> Legal can edit this field</label>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`sw-${d.id}`}>Only show when (optional)</label>
              <select id={`sw-${d.id}`} className="input" value={whenField} onChange={(e) => { setWhenField(e.target.value); setWhenValues([]); }}>
                <option value="">Always show</option>
                {others.map((o) => <option key={o.id} value={`p.${o.key}`}>{o.label}</option>)}
              </select>
            </div>
            {controller && (
              <fieldset>
                <legend className="label">is</legend>
                <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-1 overflow-y-auto rounded-md border border-line p-2">
                  {answersOf(controller).map((a) => (
                    <label key={a} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" checked={whenValues.includes(a)} onChange={(e) => setWhenValues((v) => (e.target.checked ? [...v, a] : v.filter((x) => x !== a)))} />
                      {a}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
          <p className="text-xs text-muted">The type can&apos;t change once a field exists, so existing values stay valid.</p>
          <div className="flex gap-2">
            <button className="btn-dark" disabled={pending} onClick={() => { onSave({ label, groupLabel: group, options: hasOptions ? options.split("\n") : undefined, extraEditorRoles: legal ? ["legal"] : [], showWhen: whenField ? { field: whenField, values: whenValues } : null }); setEditing(false); }}>Save</button>
            <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
    </li>
  );
}
