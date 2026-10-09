import type { ObjectType, Role } from "@/db/schema";
import type { FieldSpec } from "./fields";

// teamIds: the departments and groups the person is in. teamSeesCommercials: one of them may see
// fees and rates (e.g. Finance).
export type Actor = { id: string; role: Role; name: string; teamIds?: string[]; teamSeesCommercials?: boolean };

// Fees and rates (fields marked "commercial"): Sales, AMs, Legal, managers and admins see them;
// everyone else only through a team that's allowed to (Q63).
export function canSeeCommercials(actor: Actor) {
  return actor.role !== "viewer" || !!actor.teamSeesCommercials;
}

export function canSeeField(actor: Actor, spec: { commercial?: boolean }) {
  return !spec.commercial || canSeeCommercials(actor);
}

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
  if (spec.derive) return false; // filled in by KRM, never typed
  if (!canSeeField(actor, spec)) return false;
  // A sign-off: only the team it belongs to (admins can step in).
  if (spec.editTeam) return actor.role === "admin" || (actor.teamIds ?? []).includes(spec.editTeam);
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

// Addendums: live clients are looked after by the account management team, so any
// account manager can raise, finish or cancel one on any live deal, as can anyone who
// can edit the deal (its owner, collaborators, managers).
export function canRaiseAddendum(actor: Actor, record: { ownerId: string | null }, opts: { collaboratorIds?: string[] } = {}) {
  return actor.role === "account_manager" || canEditRecord(actor, record, opts);
}

export function canFinishAddendum(actor: Actor, record: { ownerId: string | null }, opts: { collaboratorIds?: string[] } = {}) {
  return actor.role === "account_manager" || canEditRecord(actor, record, opts);
}

// Go-live handovers: someone in the department that does the handover (admins can step in).
export function canConfirmGoLive(actor: Actor, teamIds: string[]) {
  return actor.role === "admin" || teamIds.some((t) => (actor.teamIds ?? []).includes(t));
}

// Files on deals and companies. Uploading: anyone who can edit the record, plus Legal (contracts) and
// account managers on any record; read-only people can't. Opening: as the file's access says, and
// always the person who uploaded it and admins.
export function canUploadFiles(actor: Actor, record: { ownerId: string | null }, opts: { collaboratorIds?: string[] } = {}) {
  return ["admin", "manager", "legal", "account_manager"].includes(actor.role) || canEditRecord(actor, record, opts);
}

export type FileAccessInfo = { access: "everyone" | "commercial" | "teams"; teamIds: string[]; uploadedBy: string };

export function canOpenFile(actor: Actor, file: FileAccessInfo) {
  if (actor.role === "admin" || file.uploadedBy === actor.id) return true;
  if (file.access === "everyone") return true;
  if (file.access === "commercial") return canSeeCommercials(actor);
  return file.teamIds.some((t) => (actor.teamIds ?? []).includes(t));
}

export function canDeleteFile(actor: Actor, file: { uploadedBy: string }) {
  return actor.role === "admin" || file.uploadedBy === actor.id;
}
