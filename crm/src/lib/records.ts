import { sql, type SQL } from "drizzle-orm";
import { db, type Tx } from "@/db";
import type { ObjectType } from "@/db/schema";
import { NotFoundError, PermissionError, RuleError, translateDbError } from "./errors";
import { deriveValue, FieldError, fieldsFor, normalizeValue, PROP_PREFIX, readFieldValue, sameValue, type FieldSpec } from "./fields";
import { canCreate, canDelete, canEditField, canMoveStage, OWNER_EXCEPTION_STAGES, type Actor } from "./permissions";
import { askForGoLive, askForSignOffs, autoAdvance, handOverToAccountManager } from "./stage-engine";

export const TABLES: Record<ObjectType, string> = { company: "companies", contact: "contacts", deal: "deals" };

export type Row = Record<string, unknown> & { id: string; owner_id: string | null; version: number; properties: Record<string, unknown> };

export type Conflict = { field: string; label: string; yours: unknown; theirs: unknown; original: unknown };
export type SaveResult = { status: "saved"; version: number; movedTo?: string[] } | { status: "conflict"; conflicts: Conflict[]; version: number };

// ---------- helpers ----------

async function loadSpecs(tx: Tx | typeof db, objectType: ObjectType) {
  const res = await tx.execute(sql`
    select key, label, type, options, group_label as "groupLabel", extra_editor_roles as "extraEditorRoles", show_when as "showWhen", derive, edit_team_id as "editTeam", commercial, archived
    from property_definitions where object_type = ${objectType}`);
  return fieldsFor(objectType, res.rows as never);
}

export async function lockRow(tx: Tx, objectType: ObjectType, id: string): Promise<Row> {
  const res = await tx.execute(sql`select * from ${sql.identifier(TABLES[objectType])} where id = ${id} and deleted_at is null for update`);
  const row = res.rows[0] as Row | undefined;
  if (!row) throw new NotFoundError();
  return row;
}

export async function collaboratorIds(tx: Tx | typeof db, dealId: string): Promise<string[]> {
  const res = await tx.execute(sql`select user_id from deal_collaborators where deal_id = ${dealId}`);
  return res.rows.map((r) => r.user_id as string);
}

export const readField = readFieldValue;

export async function audit(tx: Tx, actor: Actor | null, objectType: string, objectId: string, action: string, field: string | null, oldValue: unknown, newValue: unknown) {
  await tx.execute(sql`
    insert into audit_log (object_type, object_id, action, field, old_value, new_value, user_id)
    values (${objectType}, ${objectId}, ${action}, ${field}, ${JSON.stringify(oldValue ?? null)}::jsonb, ${JSON.stringify(newValue ?? null)}::jsonb, ${actor?.id ?? null})`);
}

function setClause(assignments: [string, unknown][]): SQL {
  return sql.join(
    assignments.map(([col, val]) => (col === "properties" ? sql`${sql.identifier(col)} = ${JSON.stringify(val)}::jsonb` : sql`${sql.identifier(col)} = ${val}`)),
    sql`, `,
  );
}

export async function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await db.transaction(fn);
  } catch (e) {
    translateDbError(e);
  }
}

// ---------- create ----------

export async function createRecord(actor: Actor, objectType: ObjectType, values: Record<string, unknown>): Promise<string> {
  if (!canCreate(actor)) throw new PermissionError("Your role can view records but not create them.");
  return withTx(async (tx) => {
    const specs = await loadSpecs(tx, objectType);
    const cols: Record<string, unknown> = { owner_id: actor.id, created_by: actor.id };
    const props: Record<string, unknown> = {};
    const snapshot: Record<string, unknown> = {};

    for (const spec of specs) {
      const provided = Object.prototype.hasOwnProperty.call(values, spec.key);
      if (!provided && !spec.required) continue;
      // Sign-offs and fees and rates: only the people allowed to fill them in.
      if (provided && (spec.editTeam || spec.commercial) && !canEditField(actor, objectType, { ownerId: actor.id }, spec)) {
        throw new PermissionError(`You can't fill in ${spec.label}.`);
      }
      const v = normalizeValue(spec, provided ? values[spec.key] : null);
      if (v === null) continue;
      snapshot[spec.key] = v;
      if (spec.column) cols[spec.column] = v;
      else props[spec.key.slice(PROP_PREFIX.length)] = v;
    }
    for (const key of Object.keys(values)) {
      if (!specs.some((s) => s.key === key)) throw new FieldError(key, `Unknown field "${key}".`);
    }
    for (const spec of specs.filter((x) => x.derive)) {
      const v = deriveValue(spec.derive!, snapshot[spec.derive!.from]);
      if (v === null) continue;
      snapshot[spec.key] = v;
      if (spec.column) cols[spec.column] = v;
      else props[spec.key.slice(PROP_PREFIX.length)] = v;
    }

    if (objectType === "deal") {
      const first = await tx.execute(sql`select key from pipeline_stages where kind = 'open' order by position limit 1`);
      cols.stage_key = first.rows[0]?.key;
    }
    cols.properties = props;

    const names = Object.keys(cols);
    const res = await tx.execute(sql`
      insert into ${sql.identifier(TABLES[objectType])} (${sql.join(names.map((n) => sql.identifier(n)), sql`, `)})
      values (${sql.join(names.map((n) => (n === "properties" ? sql`${JSON.stringify(cols[n])}::jsonb` : sql`${cols[n]}`)), sql`, `)})
      returning id`);
    const id = res.rows[0].id as string;
    await audit(tx, actor, objectType, id, "create", null, null, snapshot);
    if (objectType === "deal" && !(await autoAdvance(tx, id)).length) await askForSignOffs(tx, id);
    return id;
  });
}

// ---------- update with conflict detection ----------

/**
 * Saves only the fields that changed. `base` holds the value each field had when the
 * person opened the form. Under a row lock we compare it with what's stored now:
 * - another person changed a different field: no problem, both changes are kept
 * - another person changed the same field: nothing is saved and the conflict is
 *   returned, so the person can choose which value to keep and save again.
 */
export async function updateRecord(
  actor: Actor,
  objectType: ObjectType,
  id: string,
  changes: Record<string, unknown>,
  base: Record<string, unknown>,
): Promise<SaveResult> {
  return withTx(async (tx) => {
    const row = await lockRow(tx, objectType, id);
    const specs = await loadSpecs(tx, objectType);
    const collabs = objectType === "deal" ? await collaboratorIds(tx, id) : [];

    const conflicts: Conflict[] = [];
    const writes: { spec: FieldSpec; oldValue: unknown; newValue: unknown }[] = [];

    for (const [key, raw] of Object.entries(changes)) {
      const spec = specs.find((s) => s.key === key);
      if (!spec) throw new FieldError(key, `Unknown field "${key}".`);
      if (spec.derive) throw new FieldError(key, `${spec.label} fills in by itself.`);
      if (!canEditField(actor, objectType, { ownerId: row.owner_id }, spec, { collaboratorIds: collabs })) {
        throw new PermissionError(`You can't edit ${spec.label} on this record.`);
      }
      const next = normalizeValue(spec, raw);
      const current = readField(row, spec);
      if (sameValue(current, next)) continue; // already that value
      const original = Object.prototype.hasOwnProperty.call(base, key) ? base[key] : current;
      if (!sameValue(current, original)) {
        conflicts.push({ field: key, label: spec.label, yours: next, theirs: current, original });
        continue;
      }
      writes.push({ spec, oldValue: current, newValue: next });
    }

    if (conflicts.length) return { status: "conflict", conflicts, version: row.version };
    if (!writes.length) return { status: "saved", version: row.version };

    // Fields KRM fills in from another one follow the new value (e.g. tier from the amount).
    for (const spec of specs.filter((x) => x.derive)) {
      const src = specs.find((x) => x.key === spec.derive!.from);
      if (!src) continue;
      const written = writes.find((w) => w.spec.key === src.key);
      const next = deriveValue(spec.derive!, written ? written.newValue : readField(row, src));
      const current = readField(row, spec);
      if (!sameValue(current, next)) writes.push({ spec, oldValue: current, newValue: next });
    }

    const assignments: [string, unknown][] = [];
    const props = { ...(row.properties ?? {}) };
    let propsChanged = false;
    for (const w of writes) {
      if (w.spec.column) assignments.push([w.spec.column, w.newValue]);
      else {
        const k = w.spec.key.slice(PROP_PREFIX.length);
        if (w.newValue === null) delete props[k];
        else props[k] = w.newValue;
        propsChanged = true;
      }
    }
    if (propsChanged) assignments.push(["properties", props]);

    const res = await tx.execute(sql`
      update ${sql.identifier(TABLES[objectType])}
      set ${setClause(assignments)}, version = version + 1, updated_at = now()
      where id = ${id} returning version`);
    for (const w of writes) await audit(tx, actor, objectType, id, "update", w.spec.key, w.oldValue, w.newValue);
    // Same transaction and row lock: if this save completed the stage, the deal moves exactly once.
    const movedTo = objectType === "deal" ? await autoAdvance(tx, id) : [];
    // A company's fields can complete its deals' stages (e.g. the registered address).
    if (objectType === "company") {
      const deals = await tx.execute(sql`select id from deals where primary_company_id = ${id} and deleted_at is null order by id`);
      for (const d of deals.rows) await autoAdvance(tx, d.id as string);
    }
    const version = movedTo.length ? ((await tx.execute(sql`select version from deals where id = ${id}`)).rows[0].version as number) : (res.rows[0].version as number);
    return { status: "saved", version, movedTo };
  });
}

// ---------- stage moves ----------

export async function moveDealStage(
  actor: Actor,
  dealId: string,
  toStage: string,
  opts: { expectedStage: string; reason: string },
): Promise<{ status: "moved" | "unchanged" } | { status: "conflict"; currentStage: string }> {
  const reason = opts.reason.trim();
  return withTx(async (tx) => {
    const row = await lockRow(tx, "deal", dealId);
    const stage = await tx.execute(sql`select key, label, kind from pipeline_stages where key = ${toStage}`);
    if (!stage.rows[0]) throw new RuleError("That stage doesn't exist.");
    const collabs = await collaboratorIds(tx, dealId);
    if (!canMoveStage(actor, { ownerId: row.owner_id }, toStage, { collaboratorIds: collabs })) {
      throw new PermissionError(
        OWNER_EXCEPTION_STAGES.includes(toStage)
          ? "Only the deal's owner, a collaborator or a manager can do that."
          : "Deals move forward on their own when the stage is complete. Only a manager or admin can move them by hand.",
      );
    }
    if (row.stage_key !== opts.expectedStage) return { status: "conflict", currentStage: row.stage_key as string };
    if (row.stage_key === toStage) return { status: "unchanged" };
    // The Addendum stage is entered by raising an addendum, so its type and details are always recorded.
    if (stage.rows[0].kind === "change") throw new RuleError("Use \"Raise an addendum\" on the deal instead, so the type and details are recorded.");
    if (!reason) throw new RuleError("Give a reason for moving the deal. It's kept in the deal's history.", "reason");

    await tx.execute(sql`update deals set stage_key = ${toStage}, stage_entered_at = now(), version = version + 1, updated_at = now() where id = ${dealId}`);
    await audit(tx, actor, "deal", dealId, "stage", "stage", row.stage_key, { stage: toStage, reason });
    // Moving a deal out of Addendum by hand (e.g. to Terminated) cancels the addendum in progress.
    await tx.execute(sql`
      update addendums set status = 'cancelled', closed_by = ${actor.id}, closed_at = now(), close_note = ${`Deal moved to ${stage.rows[0].label} by hand: ${reason}`}
      where deal_id = ${dealId} and status = 'open'`);
    if (stage.rows[0].kind === "won") await handOverToAccountManager(tx, dealId);
    await askForSignOffs(tx, dealId);
    await askForGoLive(tx, dealId);
    return { status: "moved" };
  });
}

// ---------- delete and restore ----------

export const RESTORE_DAYS = 30;

export async function deleteRecord(actor: Actor, objectType: ObjectType, id: string) {
  if (!canDelete(actor)) throw new PermissionError("Only an admin can delete records.");
  await withTx(async (tx) => {
    await lockRow(tx, objectType, id);
    await tx.execute(sql`update ${sql.identifier(TABLES[objectType])} set deleted_at = now(), version = version + 1 where id = ${id}`);
    await audit(tx, actor, objectType, id, "delete", null, null, null);
  });
}

export async function restoreRecord(actor: Actor, objectType: ObjectType, id: string) {
  if (!canDelete(actor)) throw new PermissionError("Only an admin can restore records.");
  await withTx(async (tx) => {
    const res = await tx.execute(sql`
      update ${sql.identifier(TABLES[objectType])} set deleted_at = null, version = version + 1
      where id = ${id} and deleted_at is not null and deleted_at > now() - make_interval(days => ${RESTORE_DAYS})
      returning id`);
    if (!res.rows[0]) throw new NotFoundError(`Only records deleted in the last ${RESTORE_DAYS} days can be restored.`);
    await audit(tx, actor, objectType, id, "restore", null, null, null);
  });
}
