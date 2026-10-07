import { sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { ADDENDUM_TYPES, type AddendumStatus, type AddendumType } from "@/db/schema";
import { NotFoundError, PermissionError, RuleError } from "./errors";
import { ADDENDUM_TYPE_LABEL } from "./format";
import { canFinishAddendum, canRaiseAddendum, type Actor } from "./permissions";
import { audit, collaboratorIds, lockRow, withTx } from "./records";
import { dealAudience, notify } from "./stage-engine";

// The addendum loop, as in the sales playbook's "Addendums & Changes":
// 1. On a live deal someone raises an addendum (type + details); the deal moves to Addendum.
// 2. The account management team makes the change and marks the addendum done.
// 3. The deal goes back to the Live stage it came from, ready for the next one.
// Each trip is its own row in `addendums`, so the deal keeps a full list of past changes.
// When Asana is connected, raising will also create the AM Mission Control task and
// completing that task will call finishAddendum.

async function stageOfKind(tx: Tx, kind: string) {
  const res = await tx.execute(sql`select key, label from pipeline_stages where kind = ${kind} order by position limit 1`);
  return res.rows[0] as { key: string; label: string } | undefined;
}

async function stageLabel(tx: Tx, key: string) {
  const res = await tx.execute(sql`select label from pipeline_stages where key = ${key}`);
  return (res.rows[0]?.label as string | undefined) ?? key;
}

async function moveTo(tx: Tx, actor: Actor, row: Record<string, unknown>, toStage: string, reason: string) {
  await tx.execute(sql`update deals set stage_key = ${toStage}, stage_entered_at = now(), version = version + 1, updated_at = now() where id = ${row.id as string}`);
  await audit(tx, actor, "deal", row.id as string, "stage", "stage", row.stage_key, { stage: toStage, reason });
}

async function tell(tx: Tx, actor: Actor, row: Record<string, unknown>, extra: (string | null)[], n: { kind: string; stageKey: string; message: string }) {
  const people = [...new Set([...(await dealAudience(tx, row.id as string, row.owner_id as string | null)), ...extra])].filter((id): id is string => !!id && id !== actor.id);
  await notify(tx, people, { ...n, dealId: row.id as string });
}

export async function raiseAddendum(actor: Actor, dealId: string, input: { type: string; details: string }): Promise<string> {
  const details = input.details.trim();
  if (!(ADDENDUM_TYPES as readonly string[]).includes(input.type)) throw new RuleError("Pick the type of addendum.", "type");
  if (!details) throw new RuleError("Say exactly what's changing, so the person actioning it knows what to do.", "details");
  return withTx(async (tx) => {
    const row = await lockRow(tx, "deal", dealId);
    if (!canRaiseAddendum(actor, { ownerId: row.owner_id }, { collaboratorIds: await collaboratorIds(tx, dealId) })) {
      throw new PermissionError("Only the deal's owner, a collaborator or a manager can raise an addendum.");
    }
    const current = await tx.execute(sql`select label, kind from pipeline_stages where key = ${row.stage_key as string}`);
    if (current.rows[0]?.kind === "change") throw new RuleError("This deal already has an addendum in progress. Finish or cancel it first.");
    if (current.rows[0]?.kind !== "live") throw new RuleError("Addendums are for live deals. This deal isn't live yet.");
    const target = await stageOfKind(tx, "change");
    if (!target) throw new RuleError("There's no Addendum stage set up.");

    const res = await tx.execute(sql`
      insert into addendums (deal_id, type, details, from_stage, raised_by)
      values (${dealId}, ${input.type}, ${details}, ${row.stage_key as string}, ${actor.id}) returning id`);
    const typeLabel = ADDENDUM_TYPE_LABEL[input.type];
    await moveTo(tx, actor, row, target.key, `Addendum raised: ${typeLabel}`);
    await tell(tx, actor, row, [], { kind: "addendum_raised", stageKey: target.key, message: `${actor.name} raised a ${typeLabel} addendum on "${row.name}": ${details}` });
    return res.rows[0].id as string;
  });
}

// Marks the addendum done ("done") or drops it ("cancelled"); either way the deal
// goes back to the Live stage it came from.
async function closeAddendum(actor: Actor, addendumId: string, status: Exclude<AddendumStatus, "open">, note: string) {
  const found = await db.execute(sql`select deal_id from addendums where id = ${addendumId}`);
  if (!found.rows[0]) throw new NotFoundError("That addendum doesn't exist.");
  const dealId = found.rows[0].deal_id as string;
  await withTx(async (tx) => {
    // Lock the deal first (same order as every other change to a deal), then re-read the addendum.
    const row = await lockRow(tx, "deal", dealId);
    if (!canFinishAddendum(actor, { ownerId: row.owner_id }, { collaboratorIds: await collaboratorIds(tx, dealId) })) {
      throw new PermissionError("Only the account management team, the deal's owner, a collaborator or a manager can do that.");
    }
    const a = (await tx.execute(sql`
      select a.*, u.name as closed_by_name from addendums a left join users u on u.id = a.closed_by where a.id = ${addendumId}`)).rows[0];
    if (a.status !== "open") {
      throw new RuleError(`${a.closed_by_name ?? "Someone"} already ${a.status === "done" ? "marked this addendum as done" : "cancelled this addendum"}. Refresh to see the deal as it is now.`);
    }
    await tx.execute(sql`
      update addendums set status = ${status}, closed_by = ${actor.id}, closed_at = now(), close_note = ${note || null} where id = ${addendumId}`);
    const typeLabel = ADDENDUM_TYPE_LABEL[a.type as string] ?? a.type;
    const back = a.from_stage as string;
    const backLabel = await stageLabel(tx, back);
    const what = status === "done" ? `Addendum done: ${typeLabel}` : `Addendum cancelled: ${typeLabel}`;
    if (row.stage_key !== back) await moveTo(tx, actor, row, back, note ? `${what}. ${note}` : what);
    await tell(tx, actor, row, [a.raised_by as string | null], {
      kind: status === "done" ? "addendum_done" : "addendum_cancelled",
      stageKey: back,
      message: `${actor.name} ${status === "done" ? "finished" : "cancelled"} the ${typeLabel} addendum on "${row.name}"${note ? ` (${note})` : ""}. The deal is back in ${backLabel}.`,
    });
  });
}

export async function finishAddendum(actor: Actor, addendumId: string, note = "") {
  await closeAddendum(actor, addendumId, "done", note.trim());
}

export async function cancelAddendum(actor: Actor, addendumId: string, reason: string) {
  if (!reason.trim()) throw new RuleError("Say why it's being cancelled. It's kept in the deal's history.", "reason");
  await closeAddendum(actor, addendumId, "cancelled", reason.trim());
}

// ---------- reading ----------

export type AddendumItem = {
  id: string;
  dealId: string;
  dealName: string;
  type: AddendumType;
  details: string;
  fromStage: string;
  status: AddendumStatus;
  raisedByName: string | null;
  raisedAt: string;
  closedByName: string | null;
  closedAt: string | null;
  closeNote: string | null;
  daysOpen: number;
};

function listQuery(where: ReturnType<typeof sql>) {
  return db.execute(sql`
    select a.id, a.deal_id as "dealId", d.name as "dealName", a.type, a.details, a.from_stage as "fromStage", a.status,
           r.name as "raisedByName", a.raised_at as "raisedAt", c.name as "closedByName", a.closed_at as "closedAt",
           a.close_note as "closeNote",
           floor(extract(epoch from coalesce(a.closed_at, now()) - a.raised_at) / 86400)::int as "daysOpen"
    from addendums a
    join deals d on d.id = a.deal_id
    left join users r on r.id = a.raised_by
    left join users c on c.id = a.closed_by
    where d.deleted_at is null and ${where}
    order by a.raised_at desc`);
}

export async function dealAddendums(dealId: string) {
  return (await listQuery(sql`a.deal_id = ${dealId}`)).rows as AddendumItem[];
}

// The addendums page: everything in progress (oldest first, so nothing waits too long)
// and what was finished or cancelled in the last 30 days.
export async function addendumBoard() {
  const [open, recent] = await Promise.all([
    listQuery(sql`a.status = 'open'`),
    listQuery(sql`a.status <> 'open' and a.closed_at > now() - interval '30 days'`),
  ]);
  return { open: (open.rows as AddendumItem[]).reverse(), recent: recent.rows as AddendumItem[] };
}

export async function openAddendumCount() {
  const res = await db.execute(sql`select count(*)::int as n from addendums a join deals d on d.id = a.deal_id where a.status = 'open' and d.deleted_at is null`);
  return res.rows[0].n as number;
}
