// Pure answer-matching shared by the stage rules (server) and the forms (browser).

// "Integration type is Custom", "Via aggregator is Yes", multi-choice "includes".
export function valueMatches(v: unknown, expected: string) {
  const want = expected.trim().toLowerCase();
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return (v ? "yes" : "no") === want;
  if (Array.isArray(v)) return v.some((x) => String(x).trim().toLowerCase() === want);
  return String(v).trim().toLowerCase() === want;
}

export function hasValue(v: unknown) {
  return !(v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0));
}

// A field that only applies for certain answers ("Server name" only when "Dedicated
// server" is Yes). It's still shown if it already holds something, so nothing is hidden
// that's been filled in.
export type ShowWhen = { field: string; values: string[] };

export function isShown(field: { key: string; showWhen?: ShowWhen | null }, values: Record<string, unknown>) {
  if (!field.showWhen) return true;
  if (hasValue(values[field.key])) return true;
  return field.showWhen.values.some((want) => valueMatches(values[field.showWhen!.field], want));
}
