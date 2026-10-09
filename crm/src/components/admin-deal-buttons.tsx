"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addDealButtonAction, removeDealButtonAction } from "@/app/actions";

type Field = { key: string; label: string; type: string; options?: string[] };
type Button = { label: string; url: string; showWhen?: { field: string; values: string[] } | null };

const answersOf = (f: Field) => (f.type === "yesno" ? ["Yes", "No"] : (f.options ?? []));

// Buttons on every deal page that open another tool (the RICE evaluation, a Confluence page…).
export function AdminDealButtons({ buttons, fields }: { buttons: Button[]; fields: Field[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [whenField, setWhenField] = useState("");
  const [whenValues, setWhenValues] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const usable = fields.filter((f) => ["select", "multiselect", "yesno"].includes(f.type));
  const chosen = usable.find((f) => f.key === whenField);
  const labelOf = (key: string) => fields.find((f) => f.key === key)?.label ?? "a hidden field";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? null : (res.error ?? "Something went wrong."));
      if (res.ok) after?.();
      router.refresh();
    });
  }

  return (
    <section className="card p-5" aria-label="Buttons on deals">
      <h2 className="h2 mb-1">Buttons on deals</h2>
      <p className="mb-4 text-sm text-muted">Buttons at the top of every deal that open another tool. A button can show only when a field has certain answers.</p>
      {buttons.length === 0 ? <p className="text-sm text-muted">No buttons yet.</p> : (
        <ul className="space-y-2">
          {buttons.map((b) => (
            <li key={b.label} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3 text-sm">
              <div className="min-w-0">
                <p className="font-bold">{b.label}</p>
                <p className="truncate text-xs text-muted">
                  {b.url}
                  {b.showWhen && ` · only when ${labelOf(b.showWhen.field)} is ${b.showWhen.values.join(" or ")}`}
                </p>
              </div>
              <button className="text-xs font-bold text-muted hover:text-danger" disabled={pending} onClick={() => run(() => removeDealButtonAction(b.label))}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 space-y-2 rounded-lg border border-dashed border-line p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div><label className="label" htmlFor="db-label">Button name</label><input id="db-label" className="input" placeholder="e.g. RICE evaluation" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <div><label className="label" htmlFor="db-url">Opens</label><input id="db-url" className="input" placeholder="e.g. tools.example.com/rice" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="db-when">Only show when (optional)</label>
            <select id="db-when" className="input" value={whenField} onChange={(e) => { setWhenField(e.target.value); setWhenValues([]); }}>
              <option value="">Always show</option>
              {usable.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          {chosen && (
            <fieldset>
              <legend className="label">is</legend>
              <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-1 overflow-y-auto rounded-md border border-line p-2">
                {answersOf(chosen).map((a) => (
                  <label key={a} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={whenValues.includes(a)} onChange={(e) => setWhenValues((v) => (e.target.checked ? [...v, a] : v.filter((x) => x !== a)))} />
                    {a}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
        {msg && <p className="text-sm text-danger" role="alert">{msg}</p>}
        <button
          className="btn-dark"
          disabled={pending || !label.trim() || !url.trim() || (!!whenField && !whenValues.length)}
          onClick={() => run(() => addDealButtonAction({ label, url, showWhen: whenField ? { field: whenField, values: whenValues } : null }), () => { setLabel(""); setUrl(""); setWhenField(""); setWhenValues([]); })}
        >
          Add button
        </button>
      </div>
    </section>
  );
}
