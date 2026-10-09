import { sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { PermissionError, RuleError } from "../errors";
import { deriveValue, PROP_PREFIX, type FieldSpec } from "../fields";
import { canManageUsersAndFields, type Actor } from "../permissions";
import { audit, loadSpecs, TABLES } from "../records";
import { convertCell, convertTimestamp, norm, splitList, SPECIALS_FOR, type ImportObject, type Special, type Target } from "./plan";

// "Bring in from HubSpot": rows arrive from the import screen in chunks. Each row is created, or
// updated when a record with its HubSpot Record ID is already in KRM. Nothing moves stages, hands
// deals over or notifies anyone: the records arrive as they stand in HubSpot. A check run does the
// same work and then throws it all away, so it shows exactly what would happen.

export type Problem = { column: string; value: string; message: string };
export type RowResult = { row: number; outcome: "created" | "updated" | "skipped"; label: string; problems: Problem[] };
export type ChunkInput = {
  objectType: ImportObject;
  importId: string | null; // null = check run
  headers: string[];
  rows: string[][];
  firstRow: number; // spreadsheet row number of rows[0], for messages
  mapping: Target[]; // per column
  stageMap?: Record<string, string | null>; // HubSpot stage name → KRM stage key
};

function requireAdmin(actor: Actor) {
  if (!canManageUsersAndFields(actor)) throw new PermissionError("Only an admin can bring data in from HubSpot.");
}

class Rollback extends Error {}

export async function startImport(actor: Actor, input: { objectType: ImportObject; fileName: string }) {
  requireAdmin(actor);
  if (!["company", "contact", "deal"].includes(input.objectType)) throw new RuleError("Pick what you're bringing in.");
  const res = await db.execute(sql`
    insert into imports (object_type, file_name, created_by) values (${input.objectType}, ${input.fileName.slice(0, 200)}, ${actor.id}) returning id`);
  return res.rows[0].id as string;
}

export async function importChunk(actor: Actor, input: ChunkInput): Promise<RowResult[]> {
  requireAdmin(actor);
  const { objectType } = input;
  if (input.importId) {
    const run = (await db.execute(sql`select object_type, finished_at, created_by from imports where id = ${input.importId}`)).rows[0];
    if (!run || run.object_type !== objectType || run.finished_at) throw new RuleError("That import has already finished. Start it again.");
  }
  if (input.mapping.length !== input.headers.length) throw new RuleError("The columns don't line up. Start again.");
  if (input.rows.length > 500) throw new RuleError("Too many rows at once.");
  const results: RowResult[] = [];
  try {
    await db.transaction(async (tx) => {
      const ctx = await context(tx, objectType);
      for (let i = 0; i < input.rows.length; i++) {
        const rowNo = input.firstRow + i;
        try {
          // Each row in its own savepoint: one bad row doesn't stop the others.
          results.push(await tx.transaction((sp) => importRow(sp as unknown as Tx, actor, input, ctx, input.rows[i], rowNo)));
        } catch (e) {
          results.push({ row: rowNo, outcome: "skipped", label: labelOf(input, input.rows[i]), problems: [{ column: "", value: "", message: friendly(e) }] });
        }
      }
      if (input.importId) {
        const count = (k: RowResult["outcome"]) => results.filter((r) => r.outcome === k).length;
        await tx.execute(sql`
          update imports set created = created + ${count("created")}, updated = updated + ${count("updated")}, skipped = skipped + ${count("skipped")}
          where id = ${input.importId}`);
      } else throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return results;
}

export async function finishImport(actor: Actor, importId: string, objectType: ImportObject, headers: string[], mapping: Target[]) {
  requireAdmin(actor);
  await db.execute(sql`update imports set finished_at = now() where id = ${importId} and finished_at is null`);
  // Remember the matching for next time (the final refresh before switching off HubSpot).
  const key = `import_mapping_${objectType}`;
  const prev = ((await db.execute(sql`select value from app_settings where key = ${key}`)).rows[0]?.value ?? {}) as Record<string, Target>;
  const next = { ...prev, ...Object.fromEntries(headers.map((h, i) => [norm(h), mapping[i]])) };
  await db.execute(sql`
    insert into app_settings (key, value) values (${key}, ${JSON.stringify(next)}::jsonb)
    on conflict (key) do update set value = excluded.value, updated_at = now()`);
}

export async function rememberedMapping(objectType: ImportObject): Promise<Record<string, Target>> {
  const res = await db.execute(sql`select value from app_settings where key = ${`import_mapping_${objectType}`}`);
  return (res.rows[0]?.value ?? {}) as Record<string, Target>;
}

/** Undo: the records this import created are deleted (restorable for 30 days). Updates stay. */
export async function undoImport(actor: Actor, importId: string) {
  requireAdmin(actor);
  return db.transaction(async (tx) => {
    const run = (await tx.execute(sql`select object_type, undone_at from imports where id = ${importId} for update`)).rows[0];
    if (!run) throw new RuleError("That import doesn't exist.");
    if (run.undone_at) throw new RuleError("That import was already undone.");
    const table = TABLES[run.object_type as ImportObject];
    const gone = await tx.execute(sql`
      update ${sql.identifier(table)} set deleted_at = now(), updated_at = now()
      where import_id = ${importId} and deleted_at is null returning id`);
    for (const r of gone.rows) await audit(tx, actor, run.object_type as string, r.id as string, "delete", null, null, { undoImport: importId });
    await tx.execute(sql`update imports set undone_at = now() where id = ${importId}`);
    return gone.rows.length;
  });
}

export async function listImports() {
  const res = await db.execute(sql`
    select i.id, i.object_type as "objectType", i.file_name as "fileName", i.created_at as "createdAt", i.created, i.updated, i.skipped,
           i.finished_at as "finishedAt", i.undone_at as "undoneAt", u.name as "byName"
    from imports i join users u on u.id = i.created_by order by i.created_at desc limit 50`);
  return res.rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt as string).toISOString() })) as {
    id: string; objectType: ImportObject; fileName: string; createdAt: string; created: number; updated: number; skipped: number;
    finishedAt: string | null; undoneAt: string | null; byName: string;
  }[];
}

// ---------- one row ----------

type Ctx = {
  specs: FieldSpec[];
  stages: { key: string; kind: string; position: number }[];
  firstStage: string;
  users: Map<string, string>; // lower(name) and lower(email) → id
  companyCache: Map<string, string | null>;
};

async function context(tx: Tx, objectType: ImportObject): Promise<Ctx> {
  const [specs, stages, users] = await Promise.all([
    loadSpecs(tx, objectType),
    tx.execute(sql`select key, kind, position from pipeline_stages order by position`),
    tx.execute(sql`select id, name, email from users`),
  ]);
  const userMap = new Map<string, string>();
  for (const u of users.rows) {
    userMap.set((u.name as string).trim().toLowerCase(), u.id as string);
    if (u.email) userMap.set((u.email as string).toLowerCase(), u.id as string);
  }
  const st = stages.rows as Ctx["stages"];
  return { specs, stages: st, firstStage: st.find((s) => s.kind === "open")!.key, users: userMap, companyCache: new Map() };
}

function labelOf(input: ChunkInput, row: string[]) {
  const key = input.objectType === "contact" ? ["firstName", "lastName", "email"] : ["name"];
  const parts = key.map((k) => input.mapping.indexOf(k)).filter((i) => i >= 0).map((i) => row[i]).filter(Boolean);
  return parts.join(" ") || "(no name)";
}

function friendly(e: unknown): string {
  const err = ((e as { cause?: { constraint?: string; message?: string } })?.cause ?? e) as { constraint?: string; message?: string };
  const byConstraint: Record<string, string> = {
    companies_name_unique: "Another company already has this legal entity name",
    contacts_email_unique: "Another contact already has this email address",
    companies_website_required_online: "Online companies need a website",
    contacts_email_or_phone: "A contact needs an email address or a phone number",
    companies_hubspot_unique: "Two rows have the same HubSpot Record ID",
    contacts_hubspot_unique: "Two rows have the same HubSpot Record ID",
    deals_hubspot_unique: "Two rows have the same HubSpot Record ID",
  };
  if (err?.constraint && byConstraint[err.constraint]) return byConstraint[err.constraint];
  if (e instanceof RuleError) return e.message;
  return "This row couldn't be saved";
}

async function findCompany(tx: Tx, ctx: Ctx, ref: string): Promise<string | null> {
  const k = ref.toLowerCase();
  if (ctx.companyCache.has(k)) return ctx.companyCache.get(k)!;
  const res = await tx.execute(sql`
    select id from companies where deleted_at is null and (hubspot_id = ${ref} or lower(name) = ${k} or lower(trading_name) = ${k})
    order by (hubspot_id = ${ref}) desc nulls last limit 1`);
  const id = (res.rows[0]?.id as string | undefined) ?? null;
  ctx.companyCache.set(k, id);
  return id;
}

async function importRow(tx: Tx, actor: Actor, input: ChunkInput, ctx: Ctx, row: string[], rowNo: number): Promise<RowResult> {
  const { objectType } = input;
  const problems: Problem[] = [];
  const cols: Record<string, unknown> = {};
  const props: Record<string, unknown> = {};
  const specials: Partial<Record<Special, string>> = {};
  const note = (col: number, value: string, message: string) => problems.push({ column: input.headers[col], value, message });

  for (let c = 0; c < input.mapping.length; c++) {
    const target = input.mapping[c];
    const raw = (row[c] ?? "").trim();
    if (!target || raw === "") continue;
    if (target.startsWith("special:")) {
      const sp = target.slice(8) as Special;
      if (SPECIALS_FOR[objectType].includes(sp)) specials[sp] = raw;
      continue;
    }
    const spec = ctx.specs.find((s) => s.key === target);
    if (!spec || spec.derive) continue; // gone, or filled in by KRM itself
    const conv = convertCell(spec, raw);
    if ("problem" in conv) { note(c, raw, `${conv.problem}: left empty`); continue; }
    let value = conv.value;
    if (spec.type === "user") {
      value = ctx.users.get(raw.toLowerCase()) ?? null;
      if (!value) { note(c, raw, "Nobody with this name is in KRM (Admin → People): left empty"); continue; }
    }
    if (spec.type === "company") {
      value = await findCompany(tx, ctx, splitList(raw)[0]);
      if (!value) { note(c, raw, "No company with this HubSpot ID or name (bring companies in first): left empty"); continue; }
    }
    if (spec.column) cols[spec.column] = value;
    else props[spec.key.slice(PROP_PREFIX.length)] = value;
  }

  const hubspotId = specials.hubspotId ?? null;
  const existing = hubspotId
    ? (await tx.execute(sql`select * from ${sql.identifier(TABLES[objectType])} where hubspot_id = ${hubspotId} and deleted_at is null for update`)).rows[0]
    : undefined;

  // What each kind of record can't do without.
  if (!existing) {
    if (objectType === "contact") {
      if (!cols.email && !cols.phone) return { row: rowNo, outcome: "skipped", label: labelOf(input, row), problems: [...problems, { column: "", value: "", message: "A contact needs an email address or a phone number" }] };
      if (!cols.first_name) {
        cols.first_name = String(cols.email ?? cols.phone);
        problems.push({ column: "", value: "", message: "No first name: saved under the email address" });
      }
    } else if (!cols.name) {
      return { row: rowNo, outcome: "skipped", label: labelOf(input, row), problems: [...problems, { column: "", value: "", message: `No ${objectType === "deal" ? "deal" : "company"} name` }] };
    }
  }

  if (objectType === "deal") {
    if (specials.stage) {
      const key = input.stageMap?.[specials.stage];
      if (key && ctx.stages.some((s) => s.key === key)) cols.stage_key = key;
      else problems.push({ column: "Deal stage", value: specials.stage, message: existing ? "No KRM stage chosen for it: stage left as it is" : "No KRM stage chosen for it: starts in the first stage" });
    }
    if (specials.stageEnteredAt) {
      const t = convertTimestamp(specials.stageEnteredAt);
      if ("problem" in t) problems.push({ column: SPECIAL_LABEL("stageEnteredAt"), value: specials.stageEnteredAt, message: `${t.problem}: today used instead` });
      else cols.stage_entered_at = t.value;
    }
  }
  if (specials.createdAt && !existing) {
    const t = convertTimestamp(specials.createdAt);
    if ("problem" in t) problems.push({ column: SPECIAL_LABEL("createdAt"), value: specials.createdAt, message: `${t.problem}: today used instead` });
    else cols.created_at = t.value;
  }

  // Filled in by KRM (e.g. Customer tier from the monthly amount).
  const values = (k: string) => {
    const spec = ctx.specs.find((s) => s.key === k);
    if (!spec) return undefined;
    if (spec.column) return spec.column in cols ? cols[spec.column] : existing?.[spec.column];
    const pk = spec.key.slice(PROP_PREFIX.length);
    return pk in props ? props[pk] : (existing?.properties as Record<string, unknown> | undefined)?.[pk];
  };
  for (const spec of ctx.specs.filter((s) => s.derive)) {
    const v = deriveValue(spec.derive!, values(spec.derive!.from));
    if (spec.column) cols[spec.column] = v;
    else if (v !== null) props[spec.key.slice(PROP_PREFIX.length)] = v;
  }

  let id: string;
  let outcome: RowResult["outcome"];
  if (existing) {
    // Only the cells that have something in them change; empty cells leave KRM's value alone.
    const mergedProps = { ...((existing.properties as Record<string, unknown>) ?? {}), ...props };
    const sets = [...Object.entries(cols).map(([c, v]) => sql`${sql.identifier(c)} = ${v}`), sql`properties = ${JSON.stringify(mergedProps)}::jsonb`];
    await tx.execute(sql`
      update ${sql.identifier(TABLES[objectType])} set ${sql.join(sets, sql`, `)}, version = version + 1, updated_at = now()
      where id = ${existing.id as string}`);
    id = existing.id as string;
    outcome = "updated";
  } else {
    if (objectType === "deal") cols.stage_key ??= ctx.firstStage;
    const all: Record<string, unknown> = { ...cols, hubspot_id: hubspotId, import_id: input.importId, created_by: actor.id };
    const names = Object.keys(all);
    const res = await tx.execute(sql`
      insert into ${sql.identifier(TABLES[objectType])} (${sql.join(names.map((n) => sql.identifier(n)), sql`, `)}, properties)
      values (${sql.join(names.map((n) => sql`${all[n]}`), sql`, `)}, ${JSON.stringify(props)}::jsonb) returning id`);
    id = res.rows[0].id as string;
    outcome = "created";
  }

  // Links: a contact's company, a deal's contacts.
  if (objectType === "contact" && specials.companyLink) {
    for (const ref of splitList(specials.companyLink)) {
      const companyId = await findCompany(tx, ctx, ref);
      if (!companyId) { problems.push({ column: SPECIAL_LABEL("companyLink"), value: ref, message: "No company with this HubSpot ID or name (bring companies in first): not linked" }); continue; }
      await tx.execute(sql`insert into company_contacts (company_id, contact_id) values (${companyId}, ${id}) on conflict do nothing`);
    }
  }
  if (objectType === "deal" && specials.contactLinks) {
    for (const ref of splitList(specials.contactLinks)) {
      const c = await tx.execute(sql`
        select id from contacts where deleted_at is null and (hubspot_id = ${ref} or lower(email) = ${ref.toLowerCase()}) limit 1`);
      if (!c.rows[0]) { problems.push({ column: SPECIAL_LABEL("contactLinks"), value: ref, message: "No contact with this HubSpot ID or email (bring contacts in first): not linked" }); continue; }
      await tx.execute(sql`insert into deal_contacts (deal_id, contact_id, role) values (${id}, ${c.rows[0].id as string}, 'other') on conflict do nothing`);
    }
  }

  await audit(tx, actor, objectType, id, "import", null, null, { source: "HubSpot", hubspotId, importId: input.importId, outcome });
  return { row: rowNo, outcome, label: labelOf(input, row), problems };
}

const SPECIAL_LABEL = (s: Special) => ({ hubspotId: "Record ID", stage: "Deal stage", createdAt: "Create date", stageEnteredAt: "Date entered current stage", companyLink: "Company", contactLinks: "Contacts" })[s];
