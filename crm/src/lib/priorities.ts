import { sql } from "drizzle-orm";
import { db } from "@/db";
import { NotFoundError, PermissionError, RuleError } from "./errors";
import { canSetPriority, type Actor } from "./permissions";
import { audit, withTx } from "./records";

// Deal priorities: 1 is the most important, and each number belongs to one deal at a time.

export const MAX_PRIORITY = 999;

async function lockDeal(tx: Parameters<Parameters<typeof withTx>[0]>[0], dealId: string) {
  const row = (await tx.execute(sql`select id, name, priority from deals where id = ${dealId} and deleted_at is null for update`)).rows[0];
  if (!row) throw new NotFoundError();
  return row as { id: string; name: string; priority: number | null };
}

/** Gives a deal a priority (or takes it away with null). A number another deal has is refused. */
export async function setPriority(actor: Actor, dealId: string, priority: number | null) {
  if (!canSetPriority(actor)) throw new PermissionError("Only managers and admins set deal priorities.");
  if (priority !== null && (!Number.isInteger(priority) || priority < 1 || priority > MAX_PRIORITY)) {
    throw new RuleError(`Pick a priority from 1 to ${MAX_PRIORITY}.`);
  }
  await withTx(async (tx) => {
    // One change to the ranking at a time, so two people can't take the same number.
    await tx.execute(sql`select pg_advisory_xact_lock(5151)`);
    const deal = await lockDeal(tx, dealId);
    if (deal.priority === priority) return;
    if (priority !== null) {
      const taken = (await tx.execute(sql`select name from deals where priority = ${priority} and deleted_at is null and id <> ${dealId}`)).rows[0];
      if (taken) throw new RuleError(`Priority ${priority} is already "${taken.name}". Pick another number, or move deals around on the Priorities board.`);
    }
    await tx.execute(sql`update deals set priority = ${priority}, version = version + 1, updated_at = now() where id = ${dealId}`);
    await audit(tx, actor, "deal", dealId, "update", "priority", deal.priority, priority);
  });
}

/** Moves a deal one place up or down the ranking: it swaps numbers with its neighbour. */
export async function movePriority(actor: Actor, dealId: string, direction: "up" | "down") {
  if (!canSetPriority(actor)) throw new PermissionError("Only managers and admins set deal priorities.");
  await withTx(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(5151)`);
    const deal = await lockDeal(tx, dealId);
    if (deal.priority === null) throw new RuleError("That deal has no priority yet.");
    const neighbour = (await tx.execute(
      direction === "up"
        ? sql`select id, name, priority from deals where deleted_at is null and priority < ${deal.priority} order by priority desc limit 1 for update`
        : sql`select id, name, priority from deals where deleted_at is null and priority > ${deal.priority} order by priority asc limit 1 for update`,
    )).rows[0] as { id: string; priority: number } | undefined;
    if (!neighbour) return; // already first (or last)
    // Through null, because the same number can't be on two deals even for a moment.
    await tx.execute(sql`update deals set priority = null where id = ${dealId}`);
    await tx.execute(sql`update deals set priority = ${deal.priority}, version = version + 1, updated_at = now() where id = ${neighbour.id}`);
    await tx.execute(sql`update deals set priority = ${neighbour.priority}, version = version + 1, updated_at = now() where id = ${dealId}`);
    await audit(tx, actor, "deal", dealId, "update", "priority", deal.priority, neighbour.priority);
    await audit(tx, actor, "deal", neighbour.id, "update", "priority", neighbour.priority, deal.priority);
  });
}

export type PriorityRow = {
  id: string;
  name: string;
  priority: number;
  stageLabel: string;
  stageKind: string;
  companyName: string | null;
  ownerName: string | null;
  amountMonthly: string | null;
  daysInStage: number;
};

export async function listPriorities(): Promise<PriorityRow[]> {
  const res = await db.execute(sql`
    select d.id, d.name, d.priority, s.label as "stageLabel", s.kind as "stageKind", c.name as "companyName", u.name as "ownerName",
           d.amount_monthly as "amountMonthly", floor(extract(epoch from now() - d.stage_entered_at) / 86400)::int as "daysInStage"
    from deals d join pipeline_stages s on s.key = d.stage_key
    left join companies c on c.id = d.primary_company_id left join users u on u.id = d.owner_id
    where d.deleted_at is null and d.priority is not null order by d.priority`);
  return res.rows as PriorityRow[];
}

/** The numbers already used, with the deal using each (for the priority picker). */
export async function takenPriorities(): Promise<Record<number, { id: string; name: string }>> {
  const res = await db.execute(sql`select id, name, priority from deals where deleted_at is null and priority is not null`);
  return Object.fromEntries(res.rows.map((r) => [r.priority as number, { id: r.id as string, name: r.name as string }]));
}

// Deals that could get a priority: no number yet, and not closed (lost or terminated).
export async function dealsWithoutPriority(): Promise<{ id: string; label: string }[]> {
  const res = await db.execute(sql`
    select d.id, d.name || ' · ' || s.label as label from deals d join pipeline_stages s on s.key = d.stage_key
    where d.deleted_at is null and d.priority is null and s.kind not in ('lost', 'terminated') order by d.name`);
  return res.rows as { id: string; label: string }[];
}
