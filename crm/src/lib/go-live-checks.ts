import { sql } from "drizzle-orm";
import type { db, Tx } from "@/db";
import { GO_LIVE_CHECK_KEYS } from "@/db/schema";

// Who confirms each go-live handover, and what each deal still waits for. Kept apart from
// go-live.ts so the stage engine can use it without a circular import.

type Q = Tx | typeof db;
export type CheckKey = (typeof GO_LIVE_CHECK_KEYS)[number];

export const GO_LIVE_CHECKS: { key: CheckKey; label: string }[] = [
  { key: "legal", label: "Legal" },
  { key: "finance", label: "Finance" },
  { key: "support", label: "Support" },
  { key: "dev", label: "Dev" },
];

// Which department confirms each handover. Dev depends on the deal's platform (Kelly, 2026-10-08):
// BetMan deals → Development (Betman), VSE deals → Development (VSE).
export type GoLiveTeams = { legal: string | null; finance: string | null; support: string | null; devBetman: string | null; devVse: string | null };
export const GO_LIVE_TEAM_SLOTS: { slot: keyof GoLiveTeams; label: string; defaultName: string }[] = [
  { slot: "legal", label: "Legal", defaultName: "Risk, Legal, & Compliance" },
  { slot: "finance", label: "Finance", defaultName: "Finance" },
  { slot: "support", label: "Support", defaultName: "Support & Installations" },
  { slot: "devBetman", label: "Dev, BetMan deals", defaultName: "Development (Betman)" },
  { slot: "devVse", label: "Dev, VSE deals", defaultName: "Development (VSE)" },
];
export const GO_LIVE_SETTING = "go_live_teams";
export const PLATFORM_FIELD = "p.distribution_platform";

export function platformOf(value: unknown): "betman" | "vse" | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v.startsWith("betman")) return "betman";
  if (v.startsWith("vse")) return "vse";
  return null; // 3rd Party, Mobile Lite or not filled in yet: either Dev team can confirm
}

// The admin's choice per slot; a slot never set falls back to the department with the usual name.
export async function goLiveTeams(q: Q): Promise<GoLiveTeams> {
  const [setting, teams] = await Promise.all([
    q.execute(sql`select value from app_settings where key = ${GO_LIVE_SETTING}`),
    q.execute(sql`select id, name from teams`),
  ]);
  const chosen = (setting.rows[0]?.value ?? {}) as Partial<GoLiveTeams>;
  const ids = new Set(teams.rows.map((t) => t.id as string));
  const byName = new Map(teams.rows.map((t) => [(t.name as string).toLowerCase(), t.id as string]));
  const out = {} as GoLiveTeams;
  for (const s of GO_LIVE_TEAM_SLOTS) {
    const pick = chosen[s.slot];
    out[s.slot] = pick !== undefined ? (pick && ids.has(pick) ? pick : null) : (byName.get(s.defaultName.toLowerCase()) ?? null);
  }
  return out;
}

export function teamsForCheck(teams: GoLiveTeams, key: CheckKey, platform: unknown): string[] {
  if (key !== "dev") return teams[key] ? [teams[key]!] : [];
  const p = platformOf(platform);
  const list = p === "betman" ? [teams.devBetman] : p === "vse" ? [teams.devVse] : [teams.devBetman, teams.devVse];
  return [...new Set(list.filter((t): t is string => !!t))];
}

export type CheckStatus = {
  key: CheckKey;
  label: string;
  teamIds: string[]; // who can confirm (admins can always step in)
  teamNames: string;
  confirmed: { by: string; at: string; note: string | null } | null;
};

// Every check for each deal, confirmed or not.
export async function goLiveChecks(q: Q, deals: { id: string; properties?: Record<string, unknown> | null }[]): Promise<Map<string, CheckStatus[]>> {
  const out = new Map<string, CheckStatus[]>();
  if (!deals.length) return out;
  const ids = deals.map((d) => d.id);
  const [teams, names, rows] = await Promise.all([
    goLiveTeams(q),
    q.execute(sql`select id, name from teams`),
    q.execute(sql`
      select c.deal_id, c.check_key, c.note, c.confirmed_at, u.name as by_name
      from go_live_confirmations c join users u on u.id = c.confirmed_by
      where c.deal_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`),
  ]);
  const teamName = new Map(names.rows.map((t) => [t.id as string, t.name as string]));
  for (const d of deals) {
    const platform = d.properties?.[PLATFORM_FIELD.slice(2)];
    out.set(
      d.id,
      GO_LIVE_CHECKS.map((c) => {
        const teamIds = teamsForCheck(teams, c.key, platform);
        const row = rows.rows.find((r) => r.deal_id === d.id && r.check_key === c.key);
        return {
          key: c.key,
          label: c.label,
          teamIds,
          teamNames: teamIds.map((t) => teamName.get(t)).filter(Boolean).join(" or ") || "No department chosen yet",
          confirmed: row ? { by: row.by_name as string, at: new Date(row.confirmed_at as string).toISOString(), note: (row.note as string | null) ?? null } : null,
        };
      }),
    );
  }
  return out;
}

// For the stage engine: the checks still open on each deal (labels).
export async function goLiveMissing(q: Q, deals: { id: string; properties?: Record<string, unknown> | null }[]) {
  const checks = await goLiveChecks(q, deals);
  return new Map([...checks].map(([id, list]) => [id, list.filter((c) => !c.confirmed).map((c) => c.label)]));
}
