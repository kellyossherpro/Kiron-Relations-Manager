import { sql } from "drizzle-orm";
import { db } from "@/db";
import { FILE_ACCESS, FILE_CATEGORIES } from "@/db/schema";
import { NotFoundError, PermissionError, RuleError } from "./errors";
import { canDeleteFile, canOpenFile, canUploadFiles, type Actor, type FileAccessInfo } from "./permissions";
import { audit, collaboratorIds, TABLES, withTx } from "./records";
import { fileStore, type FileStore, type UploadTarget } from "./storage";

// Files on deals and companies (Q51): proposals and RICE reports first, later Legal's contracts.
// Private, opened only by the people each file allows, every open logged.

export type FileCategory = (typeof FILE_CATEGORIES)[number];
export type FileAccess = (typeof FILE_ACCESS)[number];
type Parent = "deal" | "company";

export const FILE_CATEGORY_LABEL: Record<FileCategory, string> = { proposal: "Proposal", rice_report: "RICE report", contract: "Contract", other: "Other" };
// Proposals and contracts hold fees and rates, so they start as "people who see fees and rates" (Q63).
export const DEFAULT_ACCESS: Record<FileCategory, FileAccess> = { proposal: "commercial", contract: "commercial", rice_report: "everyone", other: "everyone" };
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

// What can be uploaded, and the type KRM serves it as (never taken from the browser).
const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  zip: "application/zip",
  msg: "application/vnd.ms-outlook",
  eml: "message/rfc822",
};
export const ALLOWED_EXTENSIONS = Object.keys(TYPES);
// Opened in the browser rather than downloaded.
const INLINE = new Set(["application/pdf", "image/png", "image/jpeg"]);

function cleanName(name: string) {
  const n = name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f"]/g, "").trim().slice(0, 200);
  const ext = n.includes(".") ? n.split(".").pop()!.toLowerCase() : "";
  if (!n || !TYPES[ext]) throw new RuleError(`That kind of file can't be added. Use ${ALLOWED_EXTENSIONS.map((e) => e.toUpperCase()).join(", ")}.`);
  return { name: n, contentType: TYPES[ext] };
}

async function parentRow(q: typeof db, objectType: Parent, objectId: string) {
  const res = await q.execute(sql`select id, owner_id from ${sql.identifier(TABLES[objectType])} where id = ${objectId} and deleted_at is null`);
  if (!res.rows[0]) throw new NotFoundError();
  const collabs = objectType === "deal" ? await collaboratorIds(q, objectId) : [];
  return { ownerId: res.rows[0].owner_id as string | null, collabs };
}

export type StartUpload = {
  objectType: Parent;
  objectId: string;
  name: string;
  size: number;
  category: FileCategory;
  access?: FileAccess;
  teamIds?: string[];
};

/** Step 1: check and record the file, and say where the browser sends it. */
export async function startUpload(actor: Actor, input: StartUpload, store: FileStore = fileStore()): Promise<{ fileId: string; target: UploadTarget }> {
  if (input.objectType !== "deal" && input.objectType !== "company") throw new RuleError("Files go on deals and companies.");
  const parent = await parentRow(db, input.objectType, input.objectId);
  if (!canUploadFiles(actor, { ownerId: parent.ownerId }, { collaboratorIds: parent.collabs })) throw new PermissionError("You can't add files here.");
  if (!FILE_CATEGORIES.includes(input.category)) throw new RuleError("Pick what kind of file it is.");
  const { name, contentType } = cleanName(input.name);
  if (!Number.isInteger(input.size) || input.size <= 0) throw new RuleError("That file is empty.");
  if (input.size > MAX_FILE_BYTES) throw new RuleError(`Files can be up to ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
  const access = input.access ?? DEFAULT_ACCESS[input.category];
  if (!FILE_ACCESS.includes(access)) throw new RuleError("Pick who can open it.");
  const teamIds = access === "teams" ? [...new Set(input.teamIds ?? [])] : [];
  if (access === "teams") {
    if (!teamIds.length) throw new RuleError("Pick at least one department that can open it.");
    const found = await db.execute(sql`select count(*)::int as n from teams where id in (${sql.join(teamIds.map((t) => sql`${t}`), sql`, `)})`);
    if ((found.rows[0].n as number) !== teamIds.length) throw new RuleError("Pick departments that exist.");
  }
  const id = crypto.randomUUID();
  const key = `${input.objectType}/${input.objectId}/${id}`;
  await db.execute(sql`
    insert into files (id, object_type, object_id, category, name, content_type, size_bytes, storage_key, access, team_ids, uploaded_by)
    values (${id}, ${input.objectType}, ${input.objectId}, ${input.category}, ${name}, ${contentType}, ${input.size}, ${key}, ${access},
            ${JSON.stringify(teamIds)}::jsonb, ${actor.id})`);
  return { fileId: id, target: await store.uploadTarget(key, id, contentType) };
}

async function pendingFile(actor: Actor, fileId: string) {
  const f = (await db.execute(sql`select * from files where id = ${fileId} and deleted_at is null`)).rows[0];
  if (!f) throw new NotFoundError();
  if (f.uploaded_by !== actor.id) throw new PermissionError("Only the person adding the file can finish adding it.");
  return f;
}

/** Local storage only: the bytes, sent to KRM's own upload route. */
export async function receiveUpload(actor: Actor, fileId: string, bytes: Uint8Array, store: FileStore = fileStore()) {
  const f = await pendingFile(actor, fileId);
  if (f.status !== "pending") throw new RuleError("That file has already been added.");
  if (bytes.byteLength !== f.size_bytes) throw new RuleError("The file didn't arrive in one piece. Try again.");
  await store.put(f.storage_key as string, bytes, f.content_type as string);
}

/** Step 2: once the bytes have arrived, the file shows on the record. */
export async function finishUpload(actor: Actor, fileId: string, store: FileStore = fileStore()) {
  const f = await pendingFile(actor, fileId);
  if (f.status === "ready") return;
  const size = await store.size(f.storage_key as string);
  if (size !== f.size_bytes) throw new RuleError("The file didn't arrive in one piece. Try again.");
  await withTx(async (tx) => {
    await tx.execute(sql`update files set status = 'ready' where id = ${fileId}`);
    await audit(tx, actor, f.object_type as string, f.object_id as string, "file", null, null, { category: f.category, added: true });
  });
}

export type FileView = {
  id: string;
  name: string;
  category: FileCategory;
  sizeBytes: number;
  access: FileAccess;
  accessLabel: string;
  uploadedByName: string;
  uploadedAt: string;
  inline: boolean;
  canDelete: boolean;
  opens: number;
  lastOpened: { by: string; at: string } | null;
  openedBy: { by: string; at: string }[] | null; // the log, for the uploader and admins
};

// The files this person may open (newest first), and how many more there are that they can't.
export async function listFiles(actor: Actor, objectType: Parent, objectId: string): Promise<{ files: FileView[]; hidden: number }> {
  const [rows, opens, teams] = await Promise.all([
    db.execute(sql`
      select f.*, u.name as uploaded_by_name from files f join users u on u.id = f.uploaded_by
      where f.object_type = ${objectType} and f.object_id = ${objectId} and f.status = 'ready' and f.deleted_at is null
      order by f.uploaded_at desc`),
    db.execute(sql`
      select d.file_id, u.name, d.at from file_downloads d join users u on u.id = d.user_id
      join files f on f.id = d.file_id where f.object_type = ${objectType} and f.object_id = ${objectId}
      order by d.at desc`),
    db.execute(sql`select id, name from teams`),
  ]);
  const teamName = new Map(teams.rows.map((t) => [t.id as string, t.name as string]));
  const out: FileView[] = [];
  let hidden = 0;
  for (const f of rows.rows) {
    const info = accessInfo(f);
    if (!canOpenFile(actor, info)) {
      hidden++;
      continue;
    }
    const log = opens.rows.filter((o) => o.file_id === f.id).map((o) => ({ by: o.name as string, at: new Date(o.at as string).toISOString() }));
    const seesLog = actor.role === "admin" || f.uploaded_by === actor.id;
    out.push({
      id: f.id as string,
      name: f.name as string,
      category: f.category as FileCategory,
      sizeBytes: f.size_bytes as number,
      access: f.access as FileAccess,
      accessLabel:
        f.access === "everyone" ? "Everyone" : f.access === "commercial" ? "People who see fees and rates" : `Only ${info.teamIds.map((t) => teamName.get(t) ?? "a removed department").join(", ")}`,
      uploadedByName: f.uploaded_by_name as string,
      uploadedAt: new Date(f.uploaded_at as string).toISOString(),
      inline: INLINE.has(f.content_type as string),
      canDelete: canDeleteFile(actor, info),
      opens: log.length,
      lastOpened: log[0] ?? null,
      openedBy: seesLog ? log.slice(0, 50) : null,
    });
  }
  return { files: out, hidden };
}

function accessInfo(f: Record<string, unknown>): FileAccessInfo {
  return { access: f.access as FileAccess, teamIds: (f.team_ids as string[]) ?? [], uploadedBy: f.uploaded_by as string };
}

/** Opening or downloading: checks, logs, and hands back what the download route needs. */
export async function openFile(actor: Actor, fileId: string) {
  const f = (await db.execute(sql`select * from files where id = ${fileId} and status = 'ready' and deleted_at is null`)).rows[0];
  if (!f) throw new NotFoundError();
  // The file's record must still be there, and the person must be allowed to open this file.
  await parentRow(db, f.object_type as Parent, f.object_id as string);
  if (!canOpenFile(actor, accessInfo(f))) throw new PermissionError("You can't open this file.");
  await db.execute(sql`insert into file_downloads (file_id, user_id) values (${fileId}, ${actor.id})`);
  return { name: f.name as string, contentType: f.content_type as string, storageKey: f.storage_key as string, inline: INLINE.has(f.content_type as string) };
}

/** Removing a file hides it everywhere; the bytes are kept, so an admin can bring it back. */
export async function deleteFile(actor: Actor, fileId: string) {
  const f = (await db.execute(sql`select * from files where id = ${fileId} and deleted_at is null`)).rows[0];
  if (!f) throw new NotFoundError();
  if (!canDeleteFile(actor, accessInfo(f))) throw new PermissionError("Only the person who added a file, or an admin, can remove it.");
  await withTx(async (tx) => {
    await tx.execute(sql`update files set deleted_at = now(), deleted_by = ${actor.id} where id = ${fileId}`);
    await audit(tx, actor, f.object_type as string, f.object_id as string, "file", null, { category: f.category }, { category: f.category, added: false });
  });
}

// Uploads started but never finished (browser closed): cleared by the daily job after a day.
export async function clearUnfinishedUploads(now: Date = new Date(), store?: FileStore) {
  const old = await db.execute(sql`
    delete from files where status = 'pending' and uploaded_at < ${new Date(now.getTime() - 86_400_000).toISOString()} returning storage_key`);
  if (old.rows.length) {
    const s = store ?? fileStore();
    for (const r of old.rows) await s.remove(r.storage_key as string).catch(() => undefined);
  }
  return old.rows.length;
}
