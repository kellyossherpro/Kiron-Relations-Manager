import type { FieldType, ObjectType } from "@/db/schema";

// A field on a record is either a built-in column ("name", "website", ...) or an
// admin-defined property, addressed as "p.<key>" and stored in `properties`.
export const PROP_PREFIX = "p.";

export type FieldSpec = {
  key: string; // address used by forms and the record service
  label: string;
  type: FieldType | "company" | "user";
  options?: string[];
  required?: boolean;
  column?: string; // database column name for built-in fields
  group?: string;
  extraEditorRoles?: string[];
};

export const CORE_FIELDS: Record<ObjectType, FieldSpec[]> = {
  company: [
    { key: "name", column: "name", label: "Legal entity name", type: "text", required: true },
    { key: "tradingName", column: "trading_name", label: "Trading name", type: "text" },
    { key: "companyType", column: "company_type", label: "Company type", type: "select", options: ["retail", "online", "both"] },
    { key: "website", column: "website", label: "Website", type: "url" },
    { key: "parentId", column: "parent_id", label: "Parent company", type: "company" },
    { key: "ownerId", column: "owner_id", label: "Owner", type: "user" },
  ],
  contact: [
    { key: "firstName", column: "first_name", label: "First name", type: "text", required: true },
    { key: "lastName", column: "last_name", label: "Last name", type: "text" },
    { key: "email", column: "email", label: "Email", type: "email" },
    { key: "phone", column: "phone", label: "Phone or WhatsApp", type: "text" },
    { key: "jobTitle", column: "job_title", label: "Job title", type: "text" },
    { key: "ownerId", column: "owner_id", label: "Owner", type: "user" },
  ],
  deal: [
    { key: "name", column: "name", label: "Deal name", type: "text", required: true },
    { key: "amountMonthly", column: "amount_monthly", label: "Anticipated monthly amount (USD)", type: "money" },
    { key: "primaryCompanyId", column: "primary_company_id", label: "Contracting company", type: "company" },
    { key: "viaAggregatorId", column: "via_aggregator_id", label: "Via aggregator", type: "company" },
    { key: "ownerId", column: "owner_id", label: "Owner", type: "user" },
  ],
};

export type PropertyDefinitionLike = {
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  groupLabel: string | null;
  extraEditorRoles: string[];
  archived: boolean;
};

export function fieldsFor(objectType: ObjectType, defs: PropertyDefinitionLike[]): FieldSpec[] {
  const custom = defs
    .filter((d) => !d.archived)
    .map<FieldSpec>((d) => ({
      key: PROP_PREFIX + d.key,
      label: d.label,
      type: d.type,
      options: d.options,
      group: d.groupLabel ?? undefined,
      extraEditorRoles: d.extraEditorRoles,
    }));
  return [...CORE_FIELDS[objectType], ...custom];
}

export class FieldError extends Error {
  constructor(public field: string, message: string) {
    super(message);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Turns whatever a form sent into the value we store, or throws a FieldError
// written for the person filling in the form.
export function normalizeValue(spec: FieldSpec, raw: unknown): unknown {
  if (raw === undefined || raw === null) return checkRequired(spec, null);
  if (Array.isArray(raw)) {
    if (spec.type !== "multiselect") throw new FieldError(spec.key, `${spec.label} takes a single value.`);
    const vals = raw.map((v) => String(v).trim()).filter(Boolean);
    for (const v of vals) if (spec.options && !spec.options.includes(v)) throw new FieldError(spec.key, `"${v}" isn't an option for ${spec.label}.`);
    return vals.length ? vals : null;
  }
  const s = typeof raw === "string" ? raw.trim() : raw;
  if (s === "") return checkRequired(spec, null);

  switch (spec.type) {
    case "number":
    case "money": {
      const n = typeof s === "number" ? s : Number(String(s).replace(/[,\s$]/g, ""));
      if (!Number.isFinite(n)) throw new FieldError(spec.key, `${spec.label} must be a number.`);
      return spec.type === "money" ? n.toFixed(2) : n;
    }
    case "yesno":
      if (s === true || s === "yes" || s === "true") return true;
      if (s === false || s === "no" || s === "false") return false;
      throw new FieldError(spec.key, `${spec.label} must be Yes or No.`);
    case "date": {
      const d = String(s);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) throw new FieldError(spec.key, `${spec.label} must be a date.`);
      return d;
    }
    case "email":
      if (!EMAIL_RE.test(String(s))) throw new FieldError(spec.key, `${spec.label} doesn't look like an email address.`);
      return String(s);
    case "url": {
      const u = String(s);
      return /^https?:\/\//i.test(u) ? u : `https://${u}`;
    }
    case "select":
      if (spec.options && !spec.options.includes(String(s))) throw new FieldError(spec.key, `"${s}" isn't an option for ${spec.label}.`);
      return String(s);
    case "multiselect":
      return normalizeValue(spec, [s]);
    case "company":
    case "user":
      if (!UUID_RE.test(String(s))) throw new FieldError(spec.key, `${spec.label} isn't valid.`);
      return String(s);
    default:
      return String(s);
  }
}

function checkRequired(spec: FieldSpec, value: null) {
  if (spec.required) throw new FieldError(spec.key, `${spec.label} can't be empty.`);
  return value;
}

// Values compared the way people see them: "" and null are the same, numbers as text.
export function sameValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => {
    if (v === undefined || v === null || v === "") return null;
    if (Array.isArray(v)) return JSON.stringify([...v].map(String).sort());
    if (typeof v === "number") return String(v);
    if (v instanceof Date) return v.toISOString();
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  };
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  // "1500" vs "1500.00"
  if (na !== null && nb !== null && !Number.isNaN(Number(na)) && !Number.isNaN(Number(nb))) return Number(na) === Number(nb);
  return false;
}
