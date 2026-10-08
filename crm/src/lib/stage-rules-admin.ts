import { sql } from "drizzle-orm";
import { db } from "@/db";
import { DEAL_CONTACT_ROLES, REQUIREMENT_KINDS, type RequirementKind } from "@/db/schema";
import { PermissionError, RuleError } from "./errors";
import { canManageUsersAndFields, type Actor } from "./permissions";
import { loadPipelineConfig } from "./stage-engine";

// Deals enter and leave the Addendum stage only through the addendum loop (src/lib/addendums.ts).
const ADDENDUM_STAGE_MESSAGE = "The Addendum stage runs by itself: deals go in when an addendum is raised and come back to Live when it's done.";

function requireAdmin(actor: Actor) {
  if (!canManageUsersAndFields(actor)) throw new PermissionError("Only an admin can change the stage rules.");
}

async function validate(input: { stageKey: string; whenField?: string | null; whenValue?: string | null }) {
  const cfg = await loadPipelineConfig(db);
  const stage = cfg.stages.find((s) => s.key === input.stageKey);
  if (!stage) throw new RuleError("That stage doesn't exist.");
  if (stage.kind === "change") throw new RuleError(ADDENDUM_STAGE_MESSAGE);
  if (input.whenField) {
    if (!cfg.fields.some((f) => f.key === input.whenField)) throw new RuleError("Pick the field the condition depends on.");
    if (!input.whenValue?.trim()) throw new RuleError("Say which value the condition needs, e.g. Custom or Yes.");
  }
  return cfg;
}

export type RequirementInput = {
  stageKey: string;
  kind: RequirementKind;
  fieldKey?: string | null;
  contactRole?: string | null;
  whenField?: string | null;
  whenValue?: string | null;
  requiredValues?: string[] | null; // kind "field" only: the answers that count
};

// The answers a field can have, for "must be" and "only when" choices.
export function answersFor(field: { type: string; options?: string[] }) {
  return field.type === "yesno" ? ["Yes", "No"] : (field.options ?? []);
}

export async function addRequirement(actor: Actor, input: RequirementInput) {
  requireAdmin(actor);
  if (!REQUIREMENT_KINDS.includes(input.kind)) throw new RuleError("Pick what's required.");
  const cfg = await validate(input);
  const field = input.kind === "field" ? cfg.fields.find((f) => f.key === input.fieldKey) : undefined;
  if (input.kind === "field" && !field) throw new RuleError("Pick the field that must be filled in.");
  const required = input.kind === "field" ? [...new Set((input.requiredValues ?? []).map((v) => v.trim()).filter(Boolean))] : [];
  if (required.length && !required.every((v) => answersFor(field!).includes(v))) throw new RuleError(`Pick the answers from ${field!.label}'s options.`);
  if (input.kind === "has_contact" && input.contactRole && !(DEAL_CONTACT_ROLES as readonly string[]).includes(input.contactRole)) throw new RuleError("Pick a contact role.");
  const dup = cfg.requirements.some(
    (r) => r.stageKey === input.stageKey && r.kind === input.kind && (r.fieldKey ?? null) === (input.kind === "field" ? input.fieldKey : null) &&
      (r.contactRole ?? null) === (input.kind === "has_contact" ? (input.contactRole || null) : null) && (r.whenField ?? null) === (input.whenField || null) && (r.whenValue ?? null) === (input.whenField ? input.whenValue?.trim() : null) &&
      JSON.stringify([...(r.requiredValues ?? [])].sort()) === JSON.stringify([...required].sort()),
  );
  if (dup) throw new RuleError("That requirement is already on this stage.");
  const pos = cfg.requirements.filter((r) => r.stageKey === input.stageKey).reduce((m, r) => Math.max(m, r.position), 0) + 1;
  const res = await db.execute(sql`
    insert into stage_requirements (stage_key, kind, field_key, contact_role, when_field, when_value, required_values, position)
    values (${input.stageKey}, ${input.kind}, ${input.kind === "field" ? input.fieldKey! : null}, ${input.kind === "has_contact" ? input.contactRole || null : null},
            ${input.whenField || null}, ${input.whenField ? input.whenValue!.trim() : null}, ${required.length ? JSON.stringify(required) : null}::jsonb, ${pos})
    returning id`);
  return res.rows[0].id as string;
}

export async function removeRequirement(actor: Actor, id: string) {
  requireAdmin(actor);
  await db.execute(sql`delete from stage_requirements where id = ${id}`);
}

export async function addTransition(actor: Actor, input: { fromStage: string; toStage: string; whenField?: string | null; whenValue?: string | null }) {
  requireAdmin(actor);
  const cfg = await validate({ stageKey: input.fromStage, whenField: input.whenField, whenValue: input.whenValue });
  const to = cfg.stages.find((s) => s.key === input.toStage);
  if (!to) throw new RuleError("Pick the stage the deal moves to.");
  if (to.kind === "change") throw new RuleError(ADDENDUM_STAGE_MESSAGE);
  if (input.fromStage === input.toStage) throw new RuleError("A deal can't move to the stage it's already in.");
  const existing = cfg.transitions.filter((t) => t.fromStage === input.fromStage);
  // Conditional routes are checked before the "otherwise" route, so add them at the front.
  const pos = input.whenField ? Math.min(0, ...existing.map((t) => t.position)) - 1 : existing.reduce((m, t) => Math.max(m, t.position), 0) + 1;
  const res = await db.execute(sql`
    insert into stage_transitions (from_stage, to_stage, when_field, when_value, position)
    values (${input.fromStage}, ${input.toStage}, ${input.whenField || null}, ${input.whenField ? input.whenValue!.trim() : null}, ${pos})
    returning id`);
  return res.rows[0].id as string;
}

export async function removeTransition(actor: Actor, id: string) {
  requireAdmin(actor);
  await db.execute(sql`delete from stage_transitions where id = ${id}`);
}

// ---------- notifications ----------

export async function listNotifications(userId: string) {
  const res = await db.execute(sql`
    select n.id, n.kind, n.message, n.created_at as "createdAt", n.read_at as "readAt", n.deal_id as "dealId"
    from notifications n where n.user_id = ${userId} order by n.created_at desc limit 200`);
  return res.rows as { id: string; kind: string; message: string; createdAt: string; readAt: string | null; dealId: string | null }[];
}

export async function unreadCount(userId: string) {
  const res = await db.execute(sql`select count(*)::int as n from notifications where user_id = ${userId} and read_at is null`);
  return res.rows[0].n as number;
}

export async function markAllRead(userId: string) {
  await db.execute(sql`update notifications set read_at = now() where user_id = ${userId} and read_at is null`);
}
