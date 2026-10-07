"use client";

import { COMPANY_TYPE_LABEL, date, money } from "@/lib/format";
import { SearchSelect, type Option } from "./search-select";

export type ClientField = {
  key: string;
  label: string;
  type: string;
  options?: string[];
  required?: boolean;
  editable: boolean;
  group?: string;
};

export type Lookups = { companies: Option[]; users: Option[] };

function optionLabel(field: ClientField, v: string) {
  return field.key === "companyType" ? (COMPANY_TYPE_LABEL[v] ?? v) : v;
}

// How a value reads when you're not editing it.
export function FieldValue({ field, value, lookups }: { field: ClientField; value: unknown; lookups: Lookups }) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
    return <span className="text-muted/60">—</span>;
  }
  switch (field.type) {
    case "money":
      return <>{money(value)}</>;
    case "date":
      return <>{date(value)}</>;
    case "yesno":
      return <>{value === true ? "Yes" : "No"}</>;
    case "multiselect":
      return <>{(value as string[]).join(", ")}</>;
    case "select":
      return <>{optionLabel(field, String(value))}</>;
    case "url":
      return (
        <a className="font-semibold text-brand-dark underline-offset-2 hover:underline" href={String(value)} target="_blank" rel="noreferrer">
          {String(value).replace(/^https?:\/\//, "")}
        </a>
      );
    case "email":
      return <span className="select-all">{String(value)}</span>;
    case "company": {
      const c = lookups.companies.find((o) => o.id === value);
      return c ? <a className="font-semibold text-brand-dark hover:underline" href={`/companies/${c.id}`}>{c.label}</a> : <span className="text-muted">Unknown company</span>;
    }
    case "user":
      return <>{lookups.users.find((o) => o.id === value)?.label ?? "Unknown person"}</>;
    default:
      return <span className="whitespace-pre-wrap">{String(value)}</span>;
  }
}

// The input for one field while editing. Values are kept as strings/arrays/booleans.
export function FieldInput({
  field,
  value,
  onChange,
  lookups,
  invalid,
}: {
  field: ClientField;
  value: unknown;
  onChange: (v: unknown) => void;
  lookups: Lookups;
  invalid?: boolean;
}) {
  const id = `f-${field.key}`;
  const cls = `input ${invalid ? "border-danger" : ""}`;
  const str = value === null || value === undefined ? "" : String(value);
  switch (field.type) {
    case "textarea":
      return <textarea id={id} className={cls} rows={3} value={str} onChange={(e) => onChange(e.target.value)} />;
    case "number":
    case "money":
      return <input id={id} className={cls} inputMode="decimal" value={str} onChange={(e) => onChange(e.target.value)} />;
    case "date":
      return <input id={id} type="date" className={cls} value={str.slice(0, 10)} onChange={(e) => onChange(e.target.value)} />;
    case "yesno":
      return (
        <select id={id} className={cls} value={value === true ? "yes" : value === false ? "no" : ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value === "yes")}>
          <option value="">—</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      );
    case "select":
      return (
        <select id={id} className={cls} value={str} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>{optionLabel(field, o)}</option>
          ))}
        </select>
      );
    case "multiselect": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div id={id} className="flex flex-wrap gap-2">
          {field.options?.map((o) => {
            const on = selected.includes(o);
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? selected.filter((x) => x !== o) : [...selected, o])}
                className={`pill border ${on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"}`}
              >
                {o}
              </button>
            );
          })}
        </div>
      );
    }
    case "company":
      return <SearchSelect id={id} options={lookups.companies} value={(value as string) || null} onChange={onChange} placeholder="Type a company name" />;
    case "user":
      return <SearchSelect id={id} options={lookups.users} value={(value as string) || null} onChange={onChange} placeholder="Type a name" />;
    default:
      return <input id={id} type={field.type === "email" ? "email" : "text"} className={cls} value={str} onChange={(e) => onChange(e.target.value)} />;
  }
}
