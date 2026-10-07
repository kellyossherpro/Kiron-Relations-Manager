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
