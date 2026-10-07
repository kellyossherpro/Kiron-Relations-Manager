import { sql } from "drizzle-orm";
import { db } from "@/db";
import { FIELD_TYPES, OBJECT_TYPES, ROLES, type FieldType, type ObjectType, type Role } from "@/db/schema";
import { PermissionError, RuleError, translateDbError } from "./errors";
import { canManageUsersAndFields, type Actor } from "./permissions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanUser(name: string, email: string) {
  const n = name.trim();
  const e = email.trim().toLowerCase();
  if (!n) throw new RuleError("Enter a name.");
  if (!EMAIL_RE.test(e)) throw new RuleError("Enter a valid work email address.");
  return { n, e };
}

// The very first person to open a blank KRM becomes its admin. Guarded by an
// advisory lock so two people can't both become "first".
export async function createFirstAdmin(name: string, email: string): Promise<string> {
  const { n, e } = cleanUser(name, email);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4242)`);
    const count = await tx.execute(sql`select count(*)::int as c from users`);
    if ((count.rows[0].c as number) > 0) throw new RuleError("KRM is already set up. Ask an admin for access.");
    const res = await tx.execute(sql`insert into users (name, email, role) values (${n}, ${e}, 'admin') returning id`);
    return res.rows[0].id as string;
  });
}

export async function createUser(actor: Actor, input: { name: string; email: string; role: Role }) {
  if (!canManageUsersAndFields(actor)) throw new PermissionError("Only an admin can add people.");
  const { n, e } = cleanUser(input.name, input.email);
  if (!ROLES.includes(input.role)) throw new RuleError("Pick a role.");
  try {
    const res = await db.execute(sql`insert into users (name, email, role) values (${n}, ${e}, ${input.role}) returning id`);
    return res.rows[0].id as string;
  } catch (err) {
    translateDbError(err);
  }
}

export async function updateUser(actor: Actor, userId: string, input: { role?: Role; active?: boolean }) {
  if (!canManageUsersAndFields(actor)) throw new PermissionError("Only an admin can change people's access.");
  if (input.role && !ROLES.includes(input.role)) throw new RuleError("Pick a role.");
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4242)`);
    const target = await tx.execute(sql`select role, active from users where id = ${userId} for update`);
    if (!target.rows[0]) throw new RuleError("That person doesn't exist.");
    const losingAdmin = target.rows[0].role === "admin" && ((input.role && input.role !== "admin") || input.active === false);
    if (losingAdmin) {
      const admins = await tx.execute(sql`select count(*)::int as c from users where role = 'admin' and active`);
      if ((admins.rows[0].c as number) <= 1) throw new RuleError("KRM needs at least one admin. Make someone else an admin first.");
    }
    await tx.execute(sql`
      update users set role = coalesce(${input.role ?? null}, role), active = coalesce(${input.active ?? null}, active), updated_at = now()
      where id = ${userId}`);
  });
}

export function slugKey(label: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
}

export type FieldDefinitionInput = {
  objectType: ObjectType;
  label: string;
  type: FieldType;
  options?: string[];
  groupLabel?: string | null;
  extraEditorRoles?: string[];
};

function cleanOptions(type: FieldType, options: string[] | undefined) {
  const opts = [...new Set((options ?? []).map((o) => o.trim()).filter(Boolean))];
  if ((type === "select" || type === "multiselect") && opts.length < 1) throw new RuleError("Add at least one option for a dropdown field.");
  return type === "select" || type === "multiselect" ? opts : [];
}

export async function createFieldDefinition(actor: Actor, input: FieldDefinitionInput) {
  if (!canManageUsersAndFields(actor)) throw new PermissionError("Only an admin can add fields.");
  if (!OBJECT_TYPES.includes(input.objectType)) throw new RuleError("Pick where the field goes.");
  if (!FIELD_TYPES.includes(input.type)) throw new RuleError("Pick a field type.");
  const label = input.label.trim();
  const key = slugKey(label);
  if (!key) throw new RuleError("Give the field a name.");
  const options = cleanOptions(input.type, input.options);
  const roles = (input.extraEditorRoles ?? []).filter((r) => (ROLES as readonly string[]).includes(r));
  try {
    const pos = await db.execute(sql`select coalesce(max(position), 0) + 1 as p from property_definitions where object_type = ${input.objectType}`);
    const res = await db.execute(sql`
      insert into property_definitions (object_type, key, label, type, options, group_label, position, extra_editor_roles)
      values (${input.objectType}, ${key}, ${label}, ${input.type}, ${JSON.stringify(options)}::jsonb, ${input.groupLabel?.trim() || null},
              ${pos.rows[0].p as number}, ${JSON.stringify(roles)}::jsonb)
      returning id`);
    return res.rows[0].id as string;
  } catch (err) {
    translateDbError(err);
  }
}

// The field's type can't change after it's created (existing values would break).
export async function updateFieldDefinition(
  actor: Actor,
  id: string,
  input: { label?: string; options?: string[]; groupLabel?: string | null; extraEditorRoles?: string[]; archived?: boolean },
) {
  if (!canManageUsersAndFields(actor)) throw new PermissionError("Only an admin can change fields.");
  const cur = await db.execute(sql`select type from property_definitions where id = ${id}`);
  if (!cur.rows[0]) throw new RuleError("That field doesn't exist.");
  const type = cur.rows[0].type as FieldType;
  const label = input.label?.trim();
  if (input.label !== undefined && !label) throw new RuleError("Give the field a name.");
  const options = input.options !== undefined ? cleanOptions(type, input.options) : undefined;
  const roles = input.extraEditorRoles?.filter((r) => (ROLES as readonly string[]).includes(r));
  await db.execute(sql`
    update property_definitions set
      label = coalesce(${label ?? null}, label),
      options = coalesce(${options ? JSON.stringify(options) : null}::jsonb, options),
      group_label = ${input.groupLabel !== undefined ? sql`${input.groupLabel?.trim() || null}` : sql`group_label`},
      extra_editor_roles = coalesce(${roles ? JSON.stringify(roles) : null}::jsonb, extra_editor_roles),
      archived = coalesce(${input.archived ?? null}, archived),
      updated_at = now()
    where id = ${id}`);
}
