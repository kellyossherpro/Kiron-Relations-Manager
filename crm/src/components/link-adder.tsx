"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { linkAction, unlinkAction } from "@/app/actions";
import { SearchSelect, type Option } from "./search-select";

type LinkKind = "companyContact" | "dealContact" | "dealCompany" | "collaborator";

// "Add" row for a links section: pick a record, optionally a role, add.
export function LinkAdder({
  kind,
  ownerId,
  options,
  roles,
  roleFreeText,
  flip,
  buttonLabel = "Add",
  placeholder,
}: {
  kind: LinkKind;
  ownerId: string; // the record this page is about
  options: Option[];
  roles?: { value: string; label: string }[];
  roleFreeText?: boolean;
  flip?: boolean; // the page record goes second (e.g. adding a company to a contact)
  buttonLabel?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [role, setRole] = useState(roles?.[0]?.value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) return <button className="btn-ghost" onClick={() => setOpen(true)}>{buttonLabel}</button>;

  function add() {
    if (!target) return;
    start(async () => {
      const [a, b] = flip ? [target, ownerId] : [ownerId, target];
      const res = await linkAction(kind, a, b, role || null);
      if (res.ok) {
        setOpen(false);
        setTarget(null);
        setError(null);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-paper p-3">
      <SearchSelect options={options} value={target} onChange={setTarget} placeholder={placeholder} />
      {roles && (
        <select className="input" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
          {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      )}
      {roleFreeText && <input className="input" placeholder="Role or job title (optional)" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" />}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-dark" disabled={!target || pending} onClick={add}>{pending ? "Adding…" : "Add"}</button>
        <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

export function UnlinkButton({
  kind,
  a,
  b,
  role,
  label = "Remove",
}: {
  kind: "companyContactPast" | "companyContactCurrent" | "dealContact" | "dealCompany" | "collaborator";
  a: string;
  b: string;
  role?: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        className="text-xs font-bold text-muted hover:text-danger"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await unlinkAction(kind, a, b, role);
            if (!res.ok) setError(res.error);
            router.refresh();
          })
        }
      >
        {label}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
