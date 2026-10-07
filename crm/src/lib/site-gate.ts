import { createHmac, timingSafeEqual } from "node:crypto";

// A shared password in front of the whole site, for the online TEST version only
// (set SITE_PASSWORD). It keeps the made-up demo away from passers-by; it is not how
// people sign in. Microsoft sign-in replaces all of this before real data goes in.
export const GATE_COOKIE = "krm_gate";

export function gateToken(password: string) {
  return createHmac("sha256", password).update("krm-site-gate").digest("hex");
}

export function passwordMatches(given: string, password: string) {
  const a = Buffer.from(gateToken(given));
  const b = Buffer.from(gateToken(password));
  return a.length === b.length && timingSafeEqual(a, b);
}

// Only send people back to a page on this site.
export function safeNext(next: unknown) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/";
}
