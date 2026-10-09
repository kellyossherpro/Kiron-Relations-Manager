import { sql } from "drizzle-orm";
import { db } from "@/db";
import { PermissionError, RuleError } from "./errors";
import {
  GO_LIVE_CHECKS, GO_LIVE_SETTING, GO_LIVE_TEAM_SLOTS, goLiveChecks, goLiveTeams, PLATFORM_FIELD,
  type CheckKey, type CheckStatus, type GoLiveTeams,
} from "./go-live-checks";
import { canConfirmGoLive, canManageUsersAndFields, type Actor } from "./permissions";
import { audit, lockRow, withTx } from "./records";
import { autoAdvance, dealAudience, notify } from "./stage-engine";

// Go-live (Q53, decided 2026-10-08): once a deal is won and its Live date is in, Legal, Finance,
// Support and Dev each confirm their handover. The deal goes Live only when all four have.

export { GO_LIVE_CHECKS, GO_LIVE_TEAM_SLOTS, goLiveTeams, type CheckStatus, type GoLiveTeams };

async function wonDeal(tx: Parameters<typeof lockRow>[0], dealId: string) {
  const row = await lockRow(tx, "deal", dealId);
  const stage = (await tx.execute(sql`select label, kind from pipeline_stages where key = ${row.stage_key as string}`)).rows[0];
  return { row, stageKind: stage?.kind as string, stageLabel: stage?.label as string };
}

export async function confirmGoLive(actor: Actor, dealId: string, key: CheckKey, note?: string) {
  const check = GO_LIVE_CHECKS.find((c) => c.key === key);
  if (!check) throw new RuleError("Pick which handover you're confirming.");
  return withTx(async (tx) => {
    const { row, stageKind } = await wonDeal(tx, dealId);
    if (stageKind !== "won") throw new RuleError("Handovers are confirmed once the deal is Closed Won.");
    const status = (await goLiveChecks(tx, [{ id: dealId, properties: row.properties }])).get(dealId)!.find((c) => c.key === key)!;
    if (!canConfirmGoLive(actor, status.teamIds)) throw new PermissionError(`Only ${status.teamNames} can confirm the ${check.label} handover.`);
    if (status.confirmed) return { movedTo: [] as string[] };
    const team = status.teamIds.find((t) => actor.teamIds?.includes(t)) ?? null;
    await tx.execute(sql`
      insert into go_live_confirmations (deal_id, check_key, team_id, confirmed_by, note)
      values (${dealId}, ${key}, ${team}, ${actor.id}, ${note?.trim() || null})`);
    await audit(tx, actor, "deal", dealId, "go_live", `go_live.${key}`, null, { confirmed: true, note: note?.trim() || null });
    const audience = (await dealAudience(tx, dealId, row.owner_id as string | null)).filter((u) => u !== actor.id);
    await notify(tx, audience, { kind: "golive_confirmed", dealId, message: `${actor.name} confirmed the ${check.label} handover for "${row.name}".` });
    // The last confirmation moves the deal to Live (if the stage rules ask for go-live confirmations).
    return { movedTo: await autoAdvance(tx, dealId) };
  });
}

// For a mistake, while the deal hasn't gone live yet.
export async function undoGoLive(actor: Actor, dealId: string, key: CheckKey) {
  return withTx(async (tx) => {
    const { row, stageKind } = await wonDeal(tx, dealId);
    if (stageKind !== "won") throw new RuleError("The deal has moved on, so its handovers stay as they are.");
    const status = (await goLiveChecks(tx, [{ id: dealId, properties: row.properties }])).get(dealId)!.find((c) => c.key === key);
    if (!status) throw new RuleError("Pick which handover to undo.");
    if (!canConfirmGoLive(actor, status.teamIds)) throw new PermissionError(`Only ${status.teamNames} can undo the ${status.label} handover.`);
    const res = await tx.execute(sql`delete from go_live_confirmations where deal_id = ${dealId} and check_key = ${key} returning id`);
    if (res.rows.length) await audit(tx, actor, "deal", dealId, "go_live", `go_live.${key}`, { confirmed: true }, { confirmed: false });
  });
}

export async function setGoLiveTeams(actor: Actor, input: Partial<GoLiveTeams>) {
  if (!canManageUsersAndFields(actor)) throw new PermissionError("Only an admin can choose who confirms go-live.");
  const current = await goLiveTeams(db);
  const next = { ...current };
  for (const s of GO_LIVE_TEAM_SLOTS) {
    if (!(s.slot in input)) continue;
    const id = input[s.slot] || null;
    if (id && !(await db.execute(sql`select 1 from teams where id = ${id}`)).rows.length) throw new RuleError("Pick a department that exists.");
    next[s.slot] = id;
  }
  await db.execute(sql`
    insert into app_settings (key, value) values (${GO_LIVE_SETTING}, ${JSON.stringify(next)}::jsonb)
    on conflict (key) do update set value = excluded.value, updated_at = now()`);
}

export type GoLiveDeal = {
  id: string;
  name: string;
  stageKey: string;
  stageLabel: string;
  stageKind: string;
  companyName: string | null;
  ownerName: string | null;
  amountMonthly: string | null;
  platform: string | null;
  server: string | null;
  liveDate: string | null;
  enteredStageAt: string;
  checks: CheckStatus[];
};

// Won deals (with their handovers) and live deals, for the Live board and My tasks.
export async function goLiveDeals(): Promise<GoLiveDeal[]> {
  const res = await db.execute(sql`
    select d.id, d.name, d.stage_key, s.label as stage_label, s.kind as stage_kind, d.properties, d.amount_monthly,
           d.stage_entered_at, c.name as company_name, u.name as owner_name
    from deals d join pipeline_stages s on s.key = d.stage_key
    left join companies c on c.id = d.primary_company_id
    left join users u on u.id = d.owner_id
    where d.deleted_at is null and s.kind in ('won', 'live', 'change')
    order by d.stage_entered_at desc`);
  const rows = res.rows as Record<string, unknown>[];
  const checks = await goLiveChecks(db, rows.map((r) => ({ id: r.id as string, properties: r.properties as Record<string, unknown> })));
  return rows.map((r) => {
    const p = (r.properties ?? {}) as Record<string, unknown>;
    return {
      id: r.id as string,
      name: r.name as string,
      stageKey: r.stage_key as string,
      stageLabel: r.stage_label as string,
      stageKind: r.stage_kind as string,
      companyName: (r.company_name as string | null) ?? null,
      ownerName: (r.owner_name as string | null) ?? null,
      amountMonthly: (r.amount_monthly as string | null) ?? null,
      platform: (p[PLATFORM_FIELD.slice(2)] as string | undefined) ?? null,
      server: p.dedicated_server === true ? ((p.server_name as string | undefined) ?? "Dedicated") : null,
      liveDate: (p.live_date as string | undefined) ?? null,
      enteredStageAt: new Date(r.stage_entered_at as string).toISOString(),
      checks: checks.get(r.id as string) ?? [],
    };
  });
}

export type WaitingHandover = { dealId: string; dealName: string; label: string; key: CheckKey; liveDate: string | null };

// "Waiting for your go-live confirmation": won deals where one of your departments still has to confirm.
export async function goLiveWaiting(teamIds: string[]): Promise<WaitingHandover[]> {
  if (!teamIds.length) return [];
  const deals = (await goLiveDeals()).filter((d) => d.stageKind === "won");
  return deals.flatMap((d) =>
    d.checks
      .filter((c) => !c.confirmed && c.teamIds.some((t) => teamIds.includes(t)))
      .map((c) => ({ dealId: d.id, dealName: d.name, label: c.label, key: c.key, liveDate: d.liveDate })),
  );
}
