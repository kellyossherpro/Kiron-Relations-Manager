import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ACTIVITY_TYPES, type ActivityType } from "@/db/schema";
import { NotFoundError, PermissionError, RuleError } from "./errors";
import { canLogActivity, isManager, type Actor } from "./permissions";

export type ActivityInput = {
  type: ActivityType;
  subject?: string | null;
  body?: string | null;
  occurredAt?: string | null; // when a call/meeting happened; defaults to now
  dueAt?: string | null; // tasks only
  assignedTo?: string | null; // tasks only; defaults to the person creating it
  dealId?: string | null;
  companyId?: string | null;
  contactId?: string | null;
};

function parseDate(v: string | null | undefined, label: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new RuleError(`${label} isn't a valid date.`);
  return d;
}

export async function logActivity(actor: Actor, input: ActivityInput): Promise<string> {
  if (!canLogActivity(actor)) throw new PermissionError("Your role can't add notes or activities.");
  if (!ACTIVITY_TYPES.includes(input.type)) throw new RuleError("Pick what kind of activity this is.");
  if (!input.dealId && !input.companyId && !input.contactId) throw new RuleError("An activity must belong to a deal, company or contact.");
  const subject = input.subject?.trim() || null;
  const body = input.body?.trim() || null;
  if (input.type === "task" && !subject) throw new RuleError("Give the task a short description.");
  if (input.type !== "task" && !body && !subject) throw new RuleError("Write something before saving.");

  const isTask = input.type === "task";
  const occurredAt = parseDate(input.occurredAt, "The date") ?? new Date();
  const dueAt = isTask ? parseDate(input.dueAt, "The due date") : null;
  const assignedTo = isTask ? input.assignedTo || actor.id : null;

  const res = await db.execute(sql`
    insert into activities (type, subject, body, occurred_at, due_at, assigned_to, deal_id, company_id, contact_id, created_by)
    values (${input.type}, ${subject}, ${body}, ${occurredAt.toISOString()}, ${dueAt?.toISOString() ?? null}, ${assignedTo},
            ${input.dealId || null}, ${input.companyId || null}, ${input.contactId || null}, ${actor.id})
    returning id`);
  return res.rows[0].id as string;
}

export async function setTaskDone(actor: Actor, activityId: string, done: boolean) {
  const res = await db.execute(sql`select type, assigned_to, created_by from activities where id = ${activityId} and deleted_at is null`);
  const a = res.rows[0];
  if (!a) throw new NotFoundError("That task doesn't exist.");
  if (a.type !== "task") throw new RuleError("Only tasks can be marked as done.");
  if (!isManager(actor) && a.assigned_to !== actor.id && a.created_by !== actor.id) throw new PermissionError("Only the person the task is assigned to can complete it.");
  await db.execute(sql`update activities set completed_at = ${done ? sql`now()` : null}, updated_at = now() where id = ${activityId}`);
}

export async function deleteActivity(actor: Actor, activityId: string) {
  const res = await db.execute(sql`select created_by from activities where id = ${activityId} and deleted_at is null`);
  const a = res.rows[0];
  if (!a) throw new NotFoundError();
  if (actor.role !== "admin" && a.created_by !== actor.id) throw new PermissionError("You can only delete activities you added.");
  await db.execute(sql`update activities set deleted_at = now() where id = ${activityId}`);
}
