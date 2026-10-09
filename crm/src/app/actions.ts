"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OBJECT_TYPES, type ActivityType, type FieldType, type ObjectType, type Role } from "@/db/schema";
import { deleteActivity, logActivity, setTaskDone } from "@/lib/activities";
import { cancelAddendum, finishAddendum, raiseAddendum } from "@/lib/addendums";
import { createFieldDefinition, createFirstAdmin, createUser, updateFieldDefinition, updateUser } from "@/lib/admin";
import { NotFoundError, PermissionError, RuleError } from "@/lib/errors";
import { FieldError } from "@/lib/fields";
import {
  addCollaborator,
  addDealCompany,
  addDealContact,
  linkContactToCompany,
  removeCollaborator,
  removeDealCompany,
  removeDealContact,
  setContactCurrent,
} from "@/lib/links";
import { createRecord, deleteRecord, moveDealStage, restoreRecord, updateRecord, type SaveResult } from "@/lib/records";
import { requireActor, signInAs, signOut } from "@/lib/session";
import { GATE_COOKIE, gateToken, passwordMatches, safeNext } from "@/lib/site-gate";
import { applyKironPipeline } from "@/lib/kiron-pipeline";
import { finishImport, importChunk, startImport, undoImport, type ChunkInput, type RowResult } from "@/lib/import/run";
import type { ImportObject, Target } from "@/lib/import/plan";
import { deleteFile, finishUpload, startUpload, type StartUpload } from "@/lib/files";
import type { UploadTarget } from "@/lib/storage";
import { confirmGoLive, setGoLiveTeams, undoGoLive, type GoLiveTeams } from "@/lib/go-live";
import type { CheckKey } from "@/lib/go-live-checks";
import { addTeamMember, applyKironOrg, createTeam, deleteTeam, removeTeamMember, updateTeam, type TeamKind } from "@/lib/teams";
import { addDealButton, removeDealButton, type DealButton } from "@/lib/settings";
import { addRequirement, addTransition, markAllRead, removeRequirement, removeTransition, type RequirementInput } from "@/lib/stage-rules-admin";

// Every action checks who is signed in, then calls the same tested functions the
// tests use. Expected problems come back as a message for the screen.
export type ActionResult = { ok: true; id?: string } | { ok: false; error: string; field?: string };

async function attempt(fn: () => Promise<string | void>): Promise<ActionResult> {
  try {
    const id = await fn();
    return { ok: true, id: id ?? undefined };
  } catch (e) {
    if (e instanceof FieldError) return { ok: false, error: e.message, field: e.field };
    if (e instanceof RuleError) return { ok: false, error: e.message, field: e.field };
    if (e instanceof PermissionError || e instanceof NotFoundError) return { ok: false, error: e.message };
    throw e;
  }
}

// Actions can be called directly, so never trust the object type sent by the browser.
function checkType(objectType: ObjectType) {
  if (!OBJECT_TYPES.includes(objectType)) throw new Error("Unknown record type");
}

const PATHS: Record<ObjectType, string> = { company: "/companies", contact: "/contacts", deal: "/deals" };

function refresh(objectType?: ObjectType, id?: string) {
  if (objectType) {
    revalidatePath(PATHS[objectType]);
    if (id) revalidatePath(`${PATHS[objectType]}/${id}`);
  } else revalidatePath("/", "layout");
}

// ---------- sign-in ----------

// The test version's shared password (see src/proxy.ts). Comes before sign-in, so no actor yet.
export async function enterSiteAction(_: unknown, form: FormData): Promise<ActionResult> {
  const password = process.env.SITE_PASSWORD;
  if (!password) redirect("/");
  if (!passwordMatches(String(form.get("password") ?? ""), password)) return { ok: false, error: "That password isn't right. Check it and try again." };
  (await cookies()).set(GATE_COOKIE, gateToken(password), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  redirect(safeNext(form.get("next")));
}

export async function setupAction(_: unknown, form: FormData): Promise<ActionResult> {
  const res = await attempt(async () => {
    const id = await createFirstAdmin(String(form.get("name") ?? ""), String(form.get("email") ?? ""));
    await signInAs(id);
  });
  if (res.ok) redirect("/deals");
  return res;
}

export async function signInAction(userId: string) {
  await signInAs(userId);
  redirect("/deals");
}

export async function signOutAction() {
  await signOut();
  redirect("/sign-in");
}

// ---------- records ----------

export async function createRecordAction(objectType: ObjectType, values: Record<string, unknown>): Promise<ActionResult> {
  const actor = await requireActor();
  checkType(objectType);
  const res = await attempt(() => createRecord(actor, objectType, values));
  if (res.ok) refresh(objectType);
  return res;
}

export async function saveRecordAction(
  objectType: ObjectType,
  id: string,
  changes: Record<string, unknown>,
  base: Record<string, unknown>,
): Promise<SaveResult | { status: "error"; error: string; field?: string }> {
  const actor = await requireActor();
  checkType(objectType);
  let result: SaveResult | undefined;
  const res = await attempt(async () => {
    result = await updateRecord(actor, objectType, id, changes, base);
  });
  if (!res.ok) return { status: "error", error: res.error, field: res.field };
  // Only refresh the page after a real save: refreshing on a conflict would
  // replace the form the person is choosing values in.
  if (result!.status === "saved") refresh(objectType, id);
  return result!;
}

export async function moveStageAction(dealId: string, toStage: string, expectedStage: string, reason: string) {
  const actor = await requireActor();
  let outcome: Awaited<ReturnType<typeof moveDealStage>> | undefined;
  const res = await attempt(async () => {
    outcome = await moveDealStage(actor, dealId, toStage, { expectedStage, reason });
  });
  refresh("deal", dealId);
  if (!res.ok) return { status: "error" as const, error: res.error };
  return outcome!;
}

export async function deleteRecordAction(objectType: ObjectType, id: string): Promise<ActionResult> {
  const actor = await requireActor();
  checkType(objectType);
  const res = await attempt(() => deleteRecord(actor, objectType, id));
  if (res.ok) {
    refresh(objectType);
    redirect(PATHS[objectType]);
  }
  return res;
}

export async function restoreRecordAction(objectType: ObjectType, id: string): Promise<ActionResult> {
  const actor = await requireActor();
  checkType(objectType);
  const res = await attempt(() => restoreRecord(actor, objectType, id));
  refresh(objectType, id);
  return res;
}

// ---------- addendums ----------

export async function raiseAddendumAction(dealId: string, input: { type: string; details: string }): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => raiseAddendum(actor, dealId, input));
  refresh();
  return res;
}

export async function finishAddendumAction(addendumId: string, note: string): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => finishAddendum(actor, addendumId, note));
  refresh();
  return res;
}

export async function cancelAddendumAction(addendumId: string, reason: string): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => cancelAddendum(actor, addendumId, reason));
  refresh();
  return res;
}

// ---------- links ----------

export async function linkAction(
  kind: "companyContact" | "dealContact" | "dealCompany" | "collaborator",
  a: string,
  b: string,
  role: string | null,
): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(async () => {
    if (kind === "companyContact") await linkContactToCompany(actor, a, b, role);
    else if (kind === "dealContact") await addDealContact(actor, a, b, role ?? "other");
    else if (kind === "dealCompany") await addDealCompany(actor, a, b, role);
    else await addCollaborator(actor, a, b);
  });
  refresh();
  return res;
}

export async function unlinkAction(
  kind: "companyContactPast" | "companyContactCurrent" | "dealContact" | "dealCompany" | "collaborator",
  a: string,
  b: string,
  role?: string,
): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(async () => {
    if (kind === "companyContactPast") await setContactCurrent(actor, a, b, false);
    else if (kind === "companyContactCurrent") await setContactCurrent(actor, a, b, true);
    else if (kind === "dealContact") await removeDealContact(actor, a, b, role ?? "other");
    else if (kind === "dealCompany") await removeDealCompany(actor, a, b);
    else await removeCollaborator(actor, a, b);
  });
  refresh();
  return res;
}

// ---------- activity ----------

export async function logActivityAction(input: {
  type: ActivityType;
  subject?: string;
  body?: string;
  occurredAt?: string;
  dueAt?: string;
  assignedTo?: string;
  dealId?: string;
  companyId?: string;
  contactId?: string;
}): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => logActivity(actor, input));
  refresh();
  return res;
}

export async function setTaskDoneAction(activityId: string, done: boolean): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => setTaskDone(actor, activityId, done));
  refresh();
  return res;
}

export async function deleteActivityAction(activityId: string): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => deleteActivity(actor, activityId));
  refresh();
  return res;
}

// ---------- admin ----------

export async function createUserAction(input: { name: string; email?: string; role: Role; title?: string }): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => createUser(actor, input));
  revalidatePath("/admin");
  return res;
}

export async function updateUserAction(userId: string, input: { role?: Role; active?: boolean }): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => updateUser(actor, userId, input));
  revalidatePath("/admin");
  return res;
}

export async function createFieldAction(input: {
  objectType: ObjectType;
  label: string;
  type: FieldType;
  options?: string[];
  groupLabel?: string;
  extraEditorRoles?: string[];
  showWhen?: { field: string; values: string[] } | null;
  editTeamId?: string | null;
  commercial?: boolean;
}): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => createFieldDefinition(actor, input));
  refresh();
  return res;
}

export async function updateFieldAction(
  id: string,
  input: {
    label?: string; options?: string[]; groupLabel?: string | null; extraEditorRoles?: string[]; showWhen?: { field: string; values: string[] } | null;
    editTeamId?: string | null; commercial?: boolean; archived?: boolean;
  },
): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => updateFieldDefinition(actor, id, input));
  refresh();
  return res;
}

// ---------- import from HubSpot ----------

export async function startImportAction(input: { objectType: ImportObject; fileName: string }): Promise<ActionResult> {
  const actor = await requireActor();
  return attempt(() => startImport(actor, input));
}

export async function importChunkAction(input: ChunkInput): Promise<{ ok: true; results: RowResult[] } | { ok: false; error: string }> {
  const actor = await requireActor();
  let results: RowResult[] = [];
  const res = await attempt(async () => {
    results = await importChunk(actor, input);
  });
  return res.ok ? { ok: true, results } : res;
}

export async function finishImportAction(importId: string, objectType: ImportObject, headers: string[], mapping: Target[]): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => finishImport(actor, importId, objectType, headers, mapping));
  refresh();
  return res;
}

export async function undoImportAction(importId: string): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(async () => {
    await undoImport(actor, importId);
  });
  refresh();
  return res;
}

// ---------- files ----------

export async function startUploadAction(input: StartUpload): Promise<ActionResult & { target?: UploadTarget }> {
  const actor = await requireActor();
  let target: UploadTarget | undefined;
  const res = await attempt(async () => {
    const started = await startUpload(actor, input);
    target = started.target;
    return started.fileId;
  });
  return { ...res, target };
}

export async function finishUploadAction(fileId: string): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => finishUpload(actor, fileId));
  refresh();
  return res;
}

export async function deleteFileAction(fileId: string): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => deleteFile(actor, fileId));
  refresh();
  return res;
}

// ---------- go-live ----------

export async function confirmGoLiveAction(dealId: string, key: CheckKey, note?: string): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(async () => {
    await confirmGoLive(actor, dealId, key, note);
  });
  refresh();
  return res;
}

export async function undoGoLiveAction(dealId: string, key: CheckKey): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => undoGoLive(actor, dealId, key));
  refresh();
  return res;
}

export async function setGoLiveTeamsAction(input: Partial<GoLiveTeams>): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => setGoLiveTeams(actor, input));
  refresh();
  return res;
}

// ---------- departments and groups ----------

export async function applyKironOrgAction(): Promise<ActionResult & { message?: string }> {
  const actor = await requireActor();
  let message = "";
  const res = await attempt(async () => {
    const r = await applyKironOrg(actor);
    message = `${r.departments} departments. ${r.peopleAdded} people added${r.peopleFound ? `, ${r.peopleFound} already here` : ""}.`;
  });
  refresh();
  return { ...res, message };
}

export async function createTeamAction(input: { name: string; kind: TeamKind }): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => createTeam(actor, input));
  refresh();
  return res;
}

export async function updateTeamAction(teamId: string, input: { name?: string; seesCommercials?: boolean }): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => updateTeam(actor, teamId, input));
  refresh();
  return res;
}

export async function deleteTeamAction(teamId: string): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => deleteTeam(actor, teamId));
  refresh();
  return res;
}

export async function setTeamMemberAction(teamId: string, userId: string, member: boolean): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => (member ? addTeamMember(actor, teamId, userId) : removeTeamMember(actor, teamId, userId)));
  refresh();
  return res;
}

// ---------- stage rules ----------

export async function addRequirementAction(input: RequirementInput): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => addRequirement(actor, input));
  refresh();
  return res;
}

export async function removeRequirementAction(id: string): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => removeRequirement(actor, id));
  refresh();
  return res;
}

export async function addTransitionAction(input: { fromStage: string; toStage: string; whenField?: string | null; whenValue?: string | null }): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => addTransition(actor, input));
  refresh();
  return res;
}

export async function removeTransitionAction(id: string): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => removeTransition(actor, id));
  refresh();
  return res;
}

export async function applyKironPipelineAction(): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(async () => {
    await applyKironPipeline(actor);
  });
  refresh();
  return res;
}

export async function addDealButtonAction(input: DealButton): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => addDealButton(actor, input));
  refresh();
  return res;
}

export async function removeDealButtonAction(label: string): Promise<ActionResult> {
  const actor = await requireActor();
  const res = await attempt(() => removeDealButton(actor, label));
  refresh();
  return res;
}

// ---------- notifications ----------

export async function markAllReadAction() {
  const actor = await requireActor();
  await markAllRead(actor.id);
  refresh();
}
