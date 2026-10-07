// Formatting shared by server and client components.
export const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  sales: "Sales",
  account_manager: "Account manager",
  legal: "Legal",
  viewer: "Viewer",
};

export const DEAL_CONTACT_ROLE_LABEL: Record<string, string> = {
  primary: "Main contact",
  finance: "Finance",
  marketing: "Marketing",
  support: "Support",
  other: "Other",
};

// From the sales playbook's "Addendums & Changes".
export const ADDENDUM_TYPE_LABEL: Record<string, string> = {
  commercial: "Commercial / Pricing",
  new_product: "New Product",
  platform: "Platform / Technical",
  market: "Market / Territory",
  term: "Term / Renewal",
  legal_entity: "Legal Entity",
};

export const ADDENDUM_TYPE_HINT: Record<string, string> = {
  commercial: "A change to the money: fee or rate, revenue-share %, setup fee, monthly minimum or billing currency.",
  new_product: "Adding a new product or game / event type to this live client.",
  platform: "A change to how the client is delivered: new platform or channel, a dedicated-server change, or IP whitelisting.",
  market: "A new country or jurisdiction the client will operate in, plus any licence or tax that comes with it.",
  term: "A change to the agreement's length: extending the term, changing the notice period, or a renewal.",
  legal_entity: "A change to who holds the contract: entity name, registered address, registration number, or the Kiron contracting entity.",
};

export const COMPANY_TYPE_LABEL: Record<string, string> = { retail: "Retail", online: "Online", both: "Retail and online" };

export function money(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : String(v);
}

export function date(v: unknown) {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function dateTime(v: unknown) {
  if (!v) return "—";
  const d = new Date(String(v));
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
