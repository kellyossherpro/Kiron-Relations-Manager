"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addRequirementAction, addTransitionAction, removeRequirementAction, removeTransitionAction } from "@/app/actions";
import type { RequirementKind } from "@/db/schema";
import { DEAL_CONTACT_ROLE_LABEL } from "@/lib/format";

type Stage = { key: string; label: string; kind: string };
type Field = { key: string; label: string; type: string; options?: string[] };
type Req = { id: string; stageKey: string; label: string };
type Route = { id: string; fromStage: string; toStage: string; condition: string };

const WHAT: { value: RequirementKind; label: string }[] = [
  { value: "field", label: "A field is filled in" },
  { value: "has_contact", label: "A contact is added" },
  { value: "has_primary_company", label: "The contracting company is set" },
  { value: "has_collaborator", label: "A collaborator is added" },
];

// Fields a condition can depend on: ones with a fixed set of answers.
const conditionable = (f: Field) => ["select", "multiselect", "yesno"].includes(f.type);

function ConditionPicker({ fields, field, value, onField, onValue, idPrefix }: { fields: Field[]; field: string; value: string; onField: (v: string) => void; onValue: (v: string) => void; idPrefix: string }) {
  const chosen = fields.find((f) => f.key === field);
  const answers = chosen ? (chosen.type === "yesno" ? ["Yes", "No"] : (chosen.options ?? [])) : [];
  const usable = fields.filter(conditionable);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor={`${idPrefix}-when`}>Only when (optional)</label>
        <select id={`${idPrefix}-when`} className="input" value={field} onChange={(e) => { onField(e.target.value); onValue(""); }}>
          <option value="">Always</option>
          {usable.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        {usable.length === 0 && <p className="mt-1 text-xs text-muted">Add a dropdown or yes/no field to use conditions.</p>}
      </div>
      {chosen && (
        <div>
          <label className="label" htmlFor={`${idPrefix}-is`}>is</label>
          <select id={`${idPrefix}-is`} className="input" value={value} onChange={(e) => onValue(e.target.value)}>
            <option value="">Choose</option>
            {answers.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

export function AdminStageRules({ stages, fields, requirements, routes }: { stages: Stage[]; fields: Field[]; requirements: Req[]; routes: Route[] }) {
  const [open, setOpen] = useState<string | null>(stages[0]?.key ?? null);
  return (
    <section className="card p-5" aria-label="Stage rules">
      <h2 className="h2 mb-1">Stage rules</h2>
      <p className="mb-4 text-sm text-muted">
        For each stage, list what a deal needs before it can move on, and where it goes next. When everything is filled in, the deal moves by
        itself. A stage with nothing listed never moves on its own.
      </p>
      <ol className="space-y-2">
        {stages.map((s, i) => {
          const reqs = requirements.filter((r) => r.stageKey === s.key);
          const out = routes.filter((r) => r.fromStage === s.key);
          const isOpen = open === s.key;
          return (
            <li key={s.key} className="rounded-lg border border-line">
              <button className="flex w-full items-center justify-between gap-3 p-3 text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.key)}>
                <span className="font-bold">{i + 1}. {s.label}</span>
                <span className="text-xs text-muted">{reqs.length ? `${reqs.length} requirement${reqs.length === 1 ? "" : "s"}` : "No rules · moves by hand"}</span>
              </button>
              {isOpen && <StageRuleEditor stage={s} stages={stages} fields={fields} reqs={reqs} routes={out} />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function StageRuleEditor({ stage, stages, fields, reqs, routes }: { stage: Stage; stages: Stage[]; fields: Field[]; reqs: Req[]; routes: Route[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [kind, setKind] = useState<RequirementKind>("field");
  const [fieldKey, setFieldKey] = useState("");
  const [role, setRole] = useState("");
  const [whenField, setWhenField] = useState("");
  const [whenValue, setWhenValue] = useState("");
  const [to, setTo] = useState("");
  const [routeWhen, setRouteWhen] = useState("");
  const [routeValue, setRouteValue] = useState("");
  const label = (k: string) => stages.find((s) => s.key === k)?.label ?? k;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? null : (res.error ?? "Something went wrong."));
      if (res.ok) after?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-5 border-t border-line p-4">
      <div>
        <h3 className="mb-2 text-xs font-black tracking-wider text-muted uppercase">Needs before moving on</h3>
        {reqs.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : (
          <ul className="space-y-1">
            {reqs.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-md bg-paper px-3 py-2 text-sm">
                <span>{r.label}</span>
                <button className="text-xs font-bold text-muted hover:text-danger" disabled={pending} onClick={() => run(() => removeRequirementAction(r.id))}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 space-y-2 rounded-lg border border-dashed border-line p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`${stage.key}-what`}>Add a requirement</label>
              <select id={`${stage.key}-what`} className="input" value={kind} onChange={(e) => setKind(e.target.value as RequirementKind)}>
                {WHAT.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            </div>
            {kind === "field" && (
              <div>
                <label className="label" htmlFor={`${stage.key}-field`}>Which field</label>
                <select id={`${stage.key}-field`} className="input" value={fieldKey} onChange={(e) => setFieldKey(e.target.value)}>
                  <option value="">Choose a field</option>
                  {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </div>
            )}
            {kind === "has_contact" && (
              <div>
                <label className="label" htmlFor={`${stage.key}-role`}>With the role</label>
                <select id={`${stage.key}-role`} className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="">Any role</option>
                  {Object.entries(DEAL_CONTACT_ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            )}
          </div>
          <ConditionPicker idPrefix={`${stage.key}-req`} fields={fields} field={whenField} value={whenValue} onField={setWhenField} onValue={setWhenValue} />
          <button
            className="btn-dark"
            disabled={pending || (kind === "field" && !fieldKey) || (!!whenField && !whenValue)}
            onClick={() => run(() => addRequirementAction({ stageKey: stage.key, kind, fieldKey, contactRole: role, whenField, whenValue }), () => { setFieldKey(""); setWhenField(""); setWhenValue(""); })}
          >
            Add requirement
          </button>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-black tracking-wider text-muted uppercase">Then moves to</h3>
        {routes.length === 0 ? <p className="text-sm text-muted">Nowhere: deals stay here until someone moves them.</p> : (
          <ul className="space-y-1">
            {routes.map((r, i) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-md bg-paper px-3 py-2 text-sm">
                <span>
                  {i > 0 && !r.condition ? "Otherwise → " : "→ "}<strong>{label(r.toStage)}</strong>
                  {r.condition && <span className="text-muted"> {r.condition}</span>}
                </span>
                <button className="text-xs font-bold text-muted hover:text-danger" disabled={pending} onClick={() => run(() => removeTransitionAction(r.id))}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 space-y-2 rounded-lg border border-dashed border-line p-3">
          <div>
            <label className="label" htmlFor={`${stage.key}-to`}>Add a route to</label>
            <select id={`${stage.key}-to`} className="input" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Choose a stage</option>
              {stages.filter((s) => s.key !== stage.key).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <ConditionPicker idPrefix={`${stage.key}-route`} fields={fields} field={routeWhen} value={routeValue} onField={setRouteWhen} onValue={setRouteValue} />
          <p className="text-xs text-muted">Routes with a condition are checked first. The route without one is used otherwise.</p>
          <button
            className="btn-dark"
            disabled={pending || !to || (!!routeWhen && !routeValue)}
            onClick={() => run(() => addTransitionAction({ fromStage: stage.key, toStage: to, whenField: routeWhen, whenValue: routeValue }), () => { setTo(""); setRouteWhen(""); setRouteValue(""); })}
          >
            Add route
          </button>
        </div>
      </div>
      {msg && <p className="text-sm text-danger" role="alert">{msg}</p>}
    </div>
  );
}
