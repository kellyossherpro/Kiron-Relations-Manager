import { sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import type { RequirementKind } from "@/db/schema";
import { fieldsFor, readFieldValue, type FieldSpec } from "./fields";
import { DEAL_CONTACT_ROLE_LABEL } from "./format";

// ============================================================================
// Pure rules: given a deal and the pipeline settings, what's missing and where
// does the deal go next? No database here, so it's easy to test and reason about.
// ============================================================================

export type Stage = { key: string; label: string; kind: string; position: number };
export type Requirement = {
  id: string;
  stageKey: string;
  kind: RequirementKind;
  fieldKey: string | null;
  contactRole: string | null;
  whenField: string | null;
  whenValue: string | null;
  position: number;
};
export type Transition = { id: string; fromStage: string; toStage: string; whenField: string | null; whenValue: string | null; position: number };

export type PipelineConfig = {
  stages: Stage[];
  requirements: Requirement[];
  transitions: Transition[];
  fields: FieldSpec[]; // deal fields that exist right now (archived ones are left out)
};

export type DealSnapshot = {
  stageKey: string;
  values: Record<string, unknown>;
  contactRoles: string[];
  hasPrimaryCompany: boolean;
  collaboratorCount: number;
};

export type CheckedRequirement = { id: string; label: string; met: boolean };
export type Evaluation = {
  stage: Stage | undefined;
  requirements: CheckedRequirement[];
  complete: boolean; // true only if the stage has at least one requirement and all are met
  next: Stage | null; // where the deal goes when complete
};

function isFilled(v: unknown) {
  if (v === null || v === undefined || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true; // includes false for a Yes/No field: "No" is an answer
}

// "Integration type is Custom", "Via aggregator is yes", multi-choice "includes".
export function valueMatches(v: unknown, expected: string) {
  const want = expected.trim().toLowerCase();
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return (v ? "yes" : "no") === want;
  if (Array.isArray(v)) return v.some((x) => String(x).trim().toLowerCase() === want);
  return String(v).trim().toLowerCase() === want;
}

export function conditionText(cfg: PipelineConfig, whenField: string | null, whenValue: string | null) {
  if (!whenField) return "";
  const label = cfg.fields.find((f) => f.key === whenField)?.label ?? "a hidden field";
  return `when ${label} is ${whenValue}`;
}

export function requirementLabel(cfg: PipelineConfig, r: Requirement) {
  let base: string;
  if (r.kind === "field") base = cfg.fields.find((f) => f.key === r.fieldKey)?.label ?? "A hidden field";
  else if (r.kind === "has_contact") base = r.contactRole ? `${DEAL_CONTACT_ROLE_LABEL[r.contactRole] ?? r.contactRole} contact added` : "A contact added";
  else if (r.kind === "has_primary_company") base = "Contracting company set";
  else base = "A collaborator added";
  const cond = conditionText(cfg, r.whenField, r.whenValue);
  return cond ? `${base} (${cond})` : base;
}

function applies(values: Record<string, unknown>, whenField: string | null, whenValue: string | null) {
  return !whenField || valueMatches(values[whenField], whenValue ?? "");
}

export function evaluate(deal: DealSnapshot, cfg: PipelineConfig): Evaluation {
  const stage = cfg.stages.find((s) => s.key === deal.stageKey);
  const known = new Set(cfg.fields.map((f) => f.key));
  const reqs = cfg.requirements
    .filter((r) => r.stageKey === deal.stageKey)
    // A requirement on a field that's been hidden is ignored rather than blocking deals forever.
    .filter((r) => r.kind !== "field" || (r.fieldKey !== null && known.has(r.fieldKey)))
    .filter((r) => applies(deal.values, r.whenField, r.whenValue))
    .sort((a, b) => a.position - b.position);

  const checked = reqs.map<CheckedRequirement>((r) => {
    let met: boolean;
    if (r.kind === "field") met = isFilled(deal.values[r.fieldKey!]);
    else if (r.kind === "has_contact") met = r.contactRole ? deal.contactRoles.includes(r.contactRole) : deal.contactRoles.length > 0;
    else if (r.kind === "has_primary_company") met = deal.hasPrimaryCompany;
    else met = deal.collaboratorCount > 0;
    return { id: r.id, label: requirementLabel(cfg, r), met };
  });

  const transition = cfg.transitions
    .filter((t) => t.fromStage === deal.stageKey)
    .sort((a, b) => a.position - b.position)
    .find((t) => applies(deal.values, t.whenField, t.whenValue));
  const next = transition ? (cfg.stages.find((s) => s.key === transition.toStage) ?? null) : null;

  return { stage, requirements: checked, complete: checked.length > 0 && checked.every((c) => c.met), next };
}

// ============================================================================
// Database side
// ============================================================================

type Q = Tx | typeof db;

export async function loadPipelineConfig(q: Q): Promise<PipelineConfig> {
  const [stages, reqs, trans, defs] = await Promise.all([
    q.execute(sql`select key, label, kind, position from pipeline_stages order by position`),
    q.execute(sql`
      select id, stage_key as "stageKey", kind, field_key as "fieldKey", contact_role as "contactRole",
             when_field as "whenField", when_value as "whenValue", position
      from stage_requirements order by stage_key, position, created_at`),
    q.execute(sql`
      select id, from_stage as "fromStage", to_stage as "toStage", when_field as "whenField", when_value as "whenValue", position
      from stage_transitions order by from_stage, position, created_at`),
    q.execute(sql`
      select key, label, type, options, group_label as "groupLabel", extra_editor_roles as "extraEditorRoles", archived
      from property_definitions where object_type = 'deal'`),
  ]);
  return {
    stages: stages.rows as Stage[],
    requirements: reqs.rows as Requirement[],
    transitions: trans.rows as Transition[],
    fields: fieldsFor("deal", defs.rows as never),
  };
}

export async function snapshotDeal(q: Q, row: Record<string, unknown>, cfg: PipelineConfig): Promise<DealSnapshot> {
  const id = row.id as string;
  const [roles, collabs] = await Promise.all([
    q.execute(sql`
      select distinct dc.role from deal_contacts dc join contacts c on c.id = dc.contact_id
      where dc.deal_id = ${id} and c.deleted_at is null`),
    q.execute(sql`select count(*)::int as n from deal_collaborators where deal_id = ${id}`),
  ]);
  return {
    stageKey: row.stage_key as string,
    values: Object.fromEntries(cfg.fields.map((f) => [f.key, readFieldValue(row as never, f)])),
    contactRoles: roles.rows.map((r) => r.role as string),
    hasPrimaryCompany: !!row.primary_company_id,
    collaboratorCount: collabs.rows[0].n as number,
  };
}

export async function evaluateDeal(dealId: string) {
  const cfg = await loadPipelineConfig(db);
  const res = await db.execute(sql`select * from deals where id = ${dealId} and deleted_at is null`);
  if (!res.rows[0]) return null;
  return evaluate(await snapshotDeal(db, res.rows[0], cfg), cfg);
}

// "What's missing" for many deals at once (the board), in three queries.
export async function missingByDeal(): Promise<Record<string, { missing: number; total: number }>> {
  const cfg = await loadPipelineConfig(db);
  if (cfg.requirements.length === 0) return {};
  const [deals, roles, collabs] = await Promise.all([
    db.execute(sql`select * from deals where deleted_at is null`),
    db.execute(sql`select dc.deal_id, dc.role from deal_contacts dc join contacts c on c.id = dc.contact_id where c.deleted_at is null`),
    db.execute(sql`select deal_id, count(*)::int as n from deal_collaborators group by deal_id`),
  ]);
  const rolesBy = new Map<string, string[]>();
  for (const r of roles.rows) rolesBy.set(r.deal_id as string, [...(rolesBy.get(r.deal_id as string) ?? []), r.role as string]);
  const collabsBy = new Map(collabs.rows.map((r) => [r.deal_id as string, r.n as number]));
  const out: Record<string, { missing: number; total: number }> = {};
  for (const row of deals.rows) {
    const id = row.id as string;
    const ev = evaluate(
      {
        stageKey: row.stage_key as string,
        values: Object.fromEntries(cfg.fields.map((f) => [f.key, readFieldValue(row as never, f)])),
        contactRoles: rolesBy.get(id) ?? [],
        hasPrimaryCompany: !!row.primary_company_id,
        collaboratorCount: collabsBy.get(id) ?? 0,
      },
      cfg,
    );
    if (ev.requirements.length) out[id] = { missing: ev.requirements.filter((r) => !r.met).length, total: ev.requirements.length };
  }
  return out;
}

// Who hears about a deal: its owner and collaborators.
async function dealAudience(q: Q, dealId: string, ownerId: string | null) {
  const res = await q.execute(sql`select user_id from deal_collaborators where deal_id = ${dealId}`);
  return [...new Set([ownerId, ...res.rows.map((r) => r.user_id as string)].filter(Boolean) as string[])];
}

export async function notify(q: Q, userIds: string[], n: { kind: string; dealId: string; stageKey?: string; message: string }) {
  for (const userId of userIds) {
    await q.execute(sql`
      insert into notifications (user_id, kind, deal_id, stage_key, message)
      values (${userId}, ${n.kind}, ${n.dealId}, ${n.stageKey ?? null}, ${n.message})`);
  }
}

async function moveAutomatically(tx: Tx, row: Record<string, unknown>, to: Stage, reason: string, kind: string, at: Date) {
  const id = row.id as string;
  await tx.execute(sql`update deals set stage_key = ${to.key}, stage_entered_at = ${at.toISOString()}, version = version + 1, updated_at = now() where id = ${id}`);
  await tx.execute(sql`
    insert into audit_log (object_type, object_id, action, field, old_value, new_value, user_id)
    values ('deal', ${id}, 'stage', 'stage', ${JSON.stringify(row.stage_key)}::jsonb, ${JSON.stringify({ stage: to.key, reason, automatic: true })}::jsonb, null)`);
  await notify(tx, await dealAudience(tx, id, row.owner_id as string | null), {
    kind,
    dealId: id,
    stageKey: to.key,
    message: `"${row.name}" moved to ${to.label}: ${reason}`,
  });
}

/**
 * Moves a deal forward while its current stage is complete. Call inside the same
 * transaction as the change that might have completed it, after locking the deal
 * row, so two people finishing the last fields at once still move it exactly once.
 * Returns the stages it moved through.
 */
export async function autoAdvance(tx: Tx, dealId: string): Promise<string[]> {
  const cfg = await loadPipelineConfig(tx);
  const moved: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 10; i++) {
    const res = await tx.execute(sql`select * from deals where id = ${dealId} and deleted_at is null for update`);
    const row = res.rows[0];
    if (!row) break;
    seen.add(row.stage_key as string);
    const ev = evaluate(await snapshotDeal(tx, row, cfg), cfg);
    if (!ev.complete || !ev.next || seen.has(ev.next.key)) break;
    await moveAutomatically(tx, row, ev.next, `everything needed for ${ev.stage?.label ?? row.stage_key} is filled in`, "stage_auto", new Date());
    moved.push(ev.next.key);
  }
  return moved;
}

// ============================================================================
// Daily rules (run once a day by a scheduler)
// ============================================================================

export const STALE_NOTICE_DAYS = 30;
export const ON_HOLD_AFTER_DAYS = 60;
export const LOST_AFTER_ON_HOLD_DAYS = 60;
const DAY = 86_400_000;

export type DailyResult = { reminded: number; putOnHold: number; closedLost: number };

export async function runDailyRules(now: Date = new Date()): Promise<DailyResult> {
  const result: DailyResult = { reminded: 0, putOnHold: 0, closedLost: 0 };
  const stages = (await db.execute(sql`select key, label, kind, position from pipeline_stages order by position`)).rows as Stage[];
  const onHold = stages.find((s) => s.kind === "parked");
  const lost = stages.find((s) => s.kind === "lost");
  const label = (k: unknown) => stages.find((s) => s.key === k)?.label ?? String(k);
  const before = (days: number) => new Date(now.getTime() - days * DAY).toISOString();

  // 1. Reminder after 30 days in an active stage (once per stage visit).
  const stale = await db.execute(sql`
    select d.id, d.name, d.stage_key, d.owner_id from deals d join pipeline_stages s on s.key = d.stage_key
    where d.deleted_at is null and s.kind in ('open', 'won') and d.stage_entered_at <= ${before(STALE_NOTICE_DAYS)}
      and d.stage_entered_at > ${before(ON_HOLD_AFTER_DAYS)}
      and not exists (select 1 from notifications n where n.deal_id = d.id and n.kind = 'stage_stale' and n.stage_key = d.stage_key and n.created_at >= d.stage_entered_at)`);
  for (const d of stale.rows) {
    await notify(db, await dealAudience(db, d.id as string, d.owner_id as string | null), {
      kind: "stage_stale",
      dealId: d.id as string,
      stageKey: d.stage_key as string,
      message: `"${d.name}" has been in ${label(d.stage_key)} for ${STALE_NOTICE_DAYS} days. Fill in what's missing, or it moves to ${onHold?.label ?? "On Hold"} in another ${ON_HOLD_AFTER_DAYS - STALE_NOTICE_DAYS} days.`,
    });
    result.reminded++;
  }

  // 2. 60 days in an active stage -> On Hold. 3. 60 days On Hold -> Closed Lost.
  const moves: { kinds: string[]; days: number; to: Stage | undefined; reason: string; key: keyof DailyResult; kind: string }[] = [
    { kinds: ["open", "won"], days: ON_HOLD_AFTER_DAYS, to: onHold, reason: `not completed within ${ON_HOLD_AFTER_DAYS} days`, key: "putOnHold", kind: "on_hold_auto" },
    { kinds: ["parked"], days: LOST_AFTER_ON_HOLD_DAYS, to: lost, reason: `on hold for more than ${LOST_AFTER_ON_HOLD_DAYS} days`, key: "closedLost", kind: "closed_lost_auto" },
  ];
  for (const m of moves) {
    if (!m.to) continue;
    const due = await db.execute(sql`
      select d.id from deals d join pipeline_stages s on s.key = d.stage_key
      where d.deleted_at is null and s.kind in ${sql.raw(`('${m.kinds.join("','")}')`)} and d.stage_entered_at <= ${before(m.days)}`);
    for (const { id } of due.rows) {
      await db.transaction(async (tx) => {
        const res = await tx.execute(sql`select * from deals where id = ${id as string} and deleted_at is null for update`);
        const row = res.rows[0];
        const stillDue = row && stages.find((s) => s.key === row.stage_key && m.kinds.includes(s.kind)) && new Date(String(row.stage_entered_at)) <= new Date(before(m.days));
        if (!stillDue) return; // someone moved it meanwhile
        await moveAutomatically(tx, row, m.to!, m.reason, m.kind, now);
        result[m.key]++;
      });
    }
  }
  return result;
}
