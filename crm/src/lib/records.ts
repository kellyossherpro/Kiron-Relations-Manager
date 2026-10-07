import { sql, type SQL } from "drizzle-orm";
import { db, type Tx } from "@/db";
import type { ObjectType } from "@/db/schema";
import { NotFoundError, PermissionError, RuleError, translateDbError } from "./errors";
import { FieldError, fieldsFor, normalizeValue, PROP_PREFIX, readFieldValue, sameValue, type FieldSpec } from "./fields";
import { canCreate, canDelete, canEditField, canMoveStage, OWNER_EXCEPTION_STAGES, type Actor } from "./permissions";

export const TABLES: Record<ObjectType, string> = { company: "companies", contact: "contacts", deal: "deals" };

export type Row = Record<string, unknown> & { id: string; owner_id: string | null; version: number; properties: Record<string, unknown> };

export type Conflict = { field: string; label: string; yours: unknown; theirs: unknown; original: unknown };
export type SaveResult = { status: "saved"; version: number } | { status: "conflict"; conflicts: Conflict[]; version: number };

// ---------- helpers ----------

async function loadSpecs(tx: Tx | typeof db, objectType: ObjectType) {
  const res = await tx.execute(sql`
    select key, label, type, options, group_label as "groupLabel", extra_editor_roles as "extraEditorRoles", archived
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

async function audit(tx: Tx, actor: Actor | null, objectType: string, objectId: string, action: string, field: string | null, oldValue: unknown, newValue: unknown) {
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

async function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
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
      const v = normalizeValue(spec, provided ? values[spec.key] : null);
      if (v === null) continue;
      snapshot[spec.key] = v;
      if (spec.column) cols[spec.column] = v;
      else props[spec.key.slice(PROP_PREFIX.length)] = v;
    }
    for (const key of Object.keys(values)) {
      if (!specs.some((s) => s.key === key)) throw new FieldError(key, `Unknown field "${key}".`);
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
    return { status: "saved", version: res.rows[0].version as number };
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
    const stage = await tx.execute(sql`select key, label from pipeline_stages where key = ${toStage}`);
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
    if (!reason) throw new RuleError("Give a reason for moving the deal. It's kept in the deal's history.", "reason");

    await tx.execute(sql`update deals set stage_key = ${toStage}, stage_entered_at = now(), version = version + 1, updated_at = now() where id = ${dealId}`);
    await audit(tx, actor, "deal", dealId, "stage", "stage", row.stage_key, { stage: toStage, reason });
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
