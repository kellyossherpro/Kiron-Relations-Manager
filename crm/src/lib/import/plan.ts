import type { FieldSpec } from "../fields";
import { normalizeValue, FieldError, PROP_PREFIX } from "../fields";

// Which HubSpot column goes where, and turning a HubSpot cell into a KRM value. No database here:
// the import screen uses it to suggest a matching, the server uses it to bring rows in.

export type ImportObject = "company" | "contact" | "deal";

// Besides the record's own fields, a column can be:
export const SPECIAL = {
  hubspotId: "HubSpot Record ID",
  stage: "Deal stage",
  createdAt: "Date created",
  stageEnteredAt: "Date it entered its current stage",
  companyLink: "Company (links the contact to it)",
  contactLinks: "Contacts on the deal",
} as const;
export type Special = keyof typeof SPECIAL;
export const SPECIALS_FOR: Record<ImportObject, Special[]> = {
  company: ["hubspotId", "createdAt"],
  contact: ["hubspotId", "createdAt", "companyLink"],
  deal: ["hubspotId", "createdAt", "stage", "stageEnteredAt", "contactLinks"],
};
// A column's destination: a field key ("name", "p.lead_source"), "special:<name>", or null (left out).
export type Target = string | null;

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

// HubSpot's usual column names for KRM's built-in fields and the special ones.
const KNOWN: Record<ImportObject, Record<string, string>> = {
  company: {
    recordid: "special:hubspotId", companyid: "special:hubspotId", hubspotid: "special:hubspotId",
    createdate: "special:createdAt",
    companyname: "name", name: "name", legalentityname: "name",
    tradingname: "tradingName",
    websiteurl: "website", website: "website",
    parentcompany: "parentId", parentcompanyid: "parentId",
    companyowner: "ownerId", owner: "ownerId",
  },
  contact: {
    recordid: "special:hubspotId", contactid: "special:hubspotId", hubspotid: "special:hubspotId",
    createdate: "special:createdAt",
    firstname: "firstName", lastname: "lastName",
    email: "email", emailaddress: "email",
    phonenumber: "phone", phone: "phone", mobilephonenumber: "phone", whatsapp: "phone",
    jobtitle: "jobTitle",
    contactowner: "ownerId", owner: "ownerId",
    associatedcompanyidsprimary: "special:companyLink", associatedcompanyprimary: "special:companyLink",
    associatedcompanyids: "special:companyLink", associatedcompany: "special:companyLink",
    companyname: "special:companyLink", company: "special:companyLink",
  },
  deal: {
    recordid: "special:hubspotId", dealid: "special:hubspotId", hubspotid: "special:hubspotId",
    createdate: "special:createdAt",
    dealstage: "special:stage", stage: "special:stage",
    dateenteredcurrentstage: "special:stageEnteredAt",
    dealname: "name", name: "name",
    amount: "amountMonthly", anticipatedmrr: "amountMonthly", anticipatedmonthlyamount: "amountMonthly", anticipatedmonthlyamountusd: "amountMonthly",
    dealowner: "ownerId", owner: "ownerId",
    associatedcompanyidsprimary: "primaryCompanyId", associatedcompanyprimary: "primaryCompanyId",
    associatedcompanyids: "primaryCompanyId", associatedcompany: "primaryCompanyId", contractingcompany: "primaryCompanyId",
    aggregator: "viaAggregatorId",
    associatedcontactids: "special:contactLinks", associatedcontact: "special:contactLinks", associatedcontacts: "special:contactLinks",
  },
};

/** The suggested destination for each column: KRM's usual names, then a field with the same label. */
export function suggestMapping(objectType: ImportObject, headers: string[], specs: FieldSpec[], remembered: Record<string, Target> = {}): Target[] {
  const used = new Set<string>();
  return headers.map((h) => {
    const n = norm(h);
    const fromMemory = remembered[n];
    const guess =
      fromMemory !== undefined ? fromMemory :
      KNOWN[objectType][n] ?? specs.find((s) => !s.derive && norm(s.label) === n)?.key ?? null;
    if (!guess || used.has(guess)) return null; // each destination once: the first matching column wins
    used.add(guess);
    return guess;
  });
}

/** HubSpot stage names → KRM stages with the same name. */
export function suggestStages(values: string[], stages: { key: string; label: string }[]): Record<string, string | null> {
  return Object.fromEntries(values.map((v) => [v, stages.find((s) => norm(s.label) === norm(v) || s.key === norm(v))?.key ?? null]));
}

export type Converted = { value: unknown } | { problem: string };

/**
 * A HubSpot cell → the value KRM stores, or why it can't be used. Company and person fields are
 * matched later (they need the database); here they pass through as text.
 */
export function convertCell(spec: FieldSpec, raw: string): Converted {
  const s = raw.trim();
  if (s === "") return { value: null };
  try {
    switch (spec.type) {
      case "company":
      case "user":
        return { value: s };
      case "yesno": {
        const v = s.toLowerCase();
        if (["yes", "true", "1", "y"].includes(v)) return { value: true };
        if (["no", "false", "0", "n"].includes(v)) return { value: false };
        return { problem: `"${s}" isn't Yes or No` };
      }
      case "select": {
        const match = spec.options?.find((o) => o.toLowerCase() === s.toLowerCase());
        return match ? { value: match } : { problem: `"${s}" isn't one of the options` };
      }
      case "multiselect": {
        const parts = s.split(";").map((p) => p.trim()).filter(Boolean);
        const out: string[] = [];
        for (const p of parts) {
          const match = spec.options?.find((o) => o.toLowerCase() === p.toLowerCase());
          if (!match) return { problem: `"${p}" isn't one of the options` };
          out.push(match);
        }
        return { value: out.length ? out : null };
      }
      case "date": {
        const iso = s.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
        if (iso && !Number.isNaN(Date.parse(iso))) return { value: iso };
        return { problem: `"${s}" isn't a date KRM can read (use 2026-10-31)` };
      }
      default:
        return { value: normalizeValue({ ...spec, required: false }, s) };
    }
  } catch (e) {
    if (e instanceof FieldError) return { problem: `"${s}" can't be used: ${e.message}` };
    throw e;
  }
}

// A timestamp column (Create Date, Date entered current stage): ISO date or date and time.
export function convertTimestamp(raw: string): Converted {
  const s = raw.trim();
  if (!s) return { value: null };
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/);
  if (!m) return { problem: `"${s}" isn't a date KRM can read (use 2026-10-31)` };
  const d = new Date(`${m[1]}T${m[2] ?? "00:00"}Z`);
  return Number.isNaN(d.getTime()) ? { problem: `"${s}" isn't a real date` } : { value: d.toISOString() };
}

// Several HubSpot IDs or names in one cell ("123;456"): the separate values.
export const splitList = (s: string) => s.split(/[;\n]/).map((x) => x.trim()).filter(Boolean);

export const isCustom = (key: string) => key.startsWith(PROP_PREFIX);
