import type { ObjectType, Role } from "@/db/schema";
import type { FieldSpec } from "./fields";

export type Actor = { id: string; role: Role; name: string };

// Everyone signed in can see everything. Editing:
// - admin and manager: everything
// - sales and account manager: records they own, and deals they collaborate on
// - legal: only fields an admin has opened to legal (e.g. Legal & Compliance fields)
// - viewer: nothing
export function isManager(actor: Actor) {
  return actor.role === "admin" || actor.role === "manager";
}

export function canEditRecord(actor: Actor, record: { ownerId: string | null }, opts: { collaboratorIds?: string[] } = {}) {
  if (isManager(actor)) return true;
  if (actor.role !== "sales" && actor.role !== "account_manager") return false;
  if (record.ownerId === actor.id) return true;
  return opts.collaboratorIds?.includes(actor.id) ?? false;
}

export function canEditField(actor: Actor, objectType: ObjectType, record: { ownerId: string | null }, spec: FieldSpec, opts: { collaboratorIds?: string[] } = {}) {
  if (canEditRecord(actor, record, opts)) {
    // Only the owner, a manager or an admin can hand a record to someone else.
    if (spec.key === "ownerId") return isManager(actor) || record.ownerId === actor.id;
    return true;
  }
  return spec.extraEditorRoles?.includes(actor.role) ?? false;
}

export function canCreate(actor: Actor) {
  return actor.role !== "viewer" && actor.role !== "legal";
}

export function canDelete(actor: Actor) {
  return actor.role === "admin";
}

export function canLogActivity(actor: Actor) {
  return actor.role !== "viewer";
}

// Normal stage moves happen automatically (stage rules) or by a manager/admin.
// Owners can still park or close their own deals with a reason.
export const OWNER_EXCEPTION_STAGES = ["on_hold", "closed_lost", "terminated"];

export function canMoveStage(actor: Actor, record: { ownerId: string | null }, toStage: string, opts: { collaboratorIds?: string[] } = {}) {
  if (isManager(actor)) return true;
  return OWNER_EXCEPTION_STAGES.includes(toStage) && canEditRecord(actor, record, opts);
}

export function canManageUsersAndFields(actor: Actor) {
  return actor.role === "admin";
}
