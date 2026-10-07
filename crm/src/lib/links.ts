import { sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { DEAL_CONTACT_ROLES } from "@/db/schema";
import { NotFoundError, PermissionError, RuleError, translateDbError } from "./errors";
import { canEditRecord, isManager, type Actor } from "./permissions";
import { collaboratorIds, lockRow } from "./records";

async function audit(tx: Tx, actor: Actor, objectType: string, objectId: string, action: string, newValue: unknown) {
  await tx.execute(sql`
    insert into audit_log (object_type, object_id, action, field, new_value, user_id)
    values (${objectType}, ${objectId}, ${action}, 'link', ${JSON.stringify(newValue)}::jsonb, ${actor.id})`);
}

async function run<T>(fn: (tx: Tx) => Promise<T>) {
  try {
    return await db.transaction(fn);
  } catch (e) {
    translateDbError(e);
  }
}

async function requireDealEditor(tx: Tx, actor: Actor, dealId: string) {
  const deal = await lockRow(tx, "deal", dealId);
  const collabs = await collaboratorIds(tx, dealId);
  if (!canEditRecord(actor, { ownerId: deal.owner_id }, { collaboratorIds: collabs })) throw new PermissionError("You can only change links on deals you own or collaborate on.");
  return deal;
}

async function requireExists(tx: Tx, table: "companies" | "contacts" | "users", id: string) {
  const res = await tx.execute(sql`select id from ${sql.identifier(table)} where id = ${id} ${table === "users" ? sql`and active` : sql`and deleted_at is null`}`);
  if (!res.rows[0]) throw new NotFoundError();
}

// ---- contact <-> company ----

export async function linkContactToCompany(actor: Actor, companyId: string, contactId: string, role: string | null) {
  await run(async (tx) => {
    const company = await lockRow(tx, "company", companyId);
    const contact = await lockRow(tx, "contact", contactId);
    if (!canEditRecord(actor, { ownerId: company.owner_id }) && !canEditRecord(actor, { ownerId: contact.owner_id })) {
      throw new PermissionError("You can only link contacts to companies you own.");
    }
    await tx.execute(sql`
      insert into company_contacts (company_id, contact_id, role, is_current) values (${companyId}, ${contactId}, ${role?.trim() || null}, true)
      on conflict (company_id, contact_id) do update set role = excluded.role, is_current = true`);
    await audit(tx, actor, "company", companyId, "link", { contactId, role });
    await audit(tx, actor, "contact", contactId, "link", { companyId, role });
  });
}

// Keeps the history: the contact is marked as no longer at the company.
export async function setContactCurrent(actor: Actor, companyId: string, contactId: string, isCurrent: boolean) {
  await run(async (tx) => {
    const company = await lockRow(tx, "company", companyId);
    const contact = await lockRow(tx, "contact", contactId);
    if (!canEditRecord(actor, { ownerId: company.owner_id }) && !canEditRecord(actor, { ownerId: contact.owner_id })) throw new PermissionError();
    await tx.execute(sql`update company_contacts set is_current = ${isCurrent} where company_id = ${companyId} and contact_id = ${contactId}`);
    await audit(tx, actor, "contact", contactId, isCurrent ? "link" : "unlink", { companyId, isCurrent });
  });
}

// ---- deal <-> contacts (with roles) ----

export async function addDealContact(actor: Actor, dealId: string, contactId: string, role: string) {
  if (!(DEAL_CONTACT_ROLES as readonly string[]).includes(role)) throw new RuleError("Pick a role for this contact.");
  await run(async (tx) => {
    await requireDealEditor(tx, actor, dealId);
    await requireExists(tx, "contacts", contactId);
    await tx.execute(sql`insert into deal_contacts (deal_id, contact_id, role) values (${dealId}, ${contactId}, ${role}) on conflict do nothing`);
    await audit(tx, actor, "deal", dealId, "link", { contactId, role });
  });
}

export async function removeDealContact(actor: Actor, dealId: string, contactId: string, role: string) {
  await run(async (tx) => {
    await requireDealEditor(tx, actor, dealId);
    await tx.execute(sql`delete from deal_contacts where deal_id = ${dealId} and contact_id = ${contactId} and role = ${role}`);
    await audit(tx, actor, "deal", dealId, "unlink", { contactId, role });
  });
}

// ---- deal <-> other companies ----

export async function addDealCompany(actor: Actor, dealId: string, companyId: string, role: string | null) {
  await run(async (tx) => {
    await requireDealEditor(tx, actor, dealId);
    await requireExists(tx, "companies", companyId);
    await tx.execute(sql`
      insert into deal_companies (deal_id, company_id, role) values (${dealId}, ${companyId}, ${role?.trim() || null})
      on conflict (deal_id, company_id) do update set role = excluded.role`);
    await audit(tx, actor, "deal", dealId, "link", { companyId, role });
  });
}

export async function removeDealCompany(actor: Actor, dealId: string, companyId: string) {
  await run(async (tx) => {
    await requireDealEditor(tx, actor, dealId);
    await tx.execute(sql`delete from deal_companies where deal_id = ${dealId} and company_id = ${companyId}`);
    await audit(tx, actor, "deal", dealId, "unlink", { companyId });
  });
}

// ---- collaborators ----

export async function addCollaborator(actor: Actor, dealId: string, userId: string) {
  await run(async (tx) => {
    const deal = await lockRow(tx, "deal", dealId);
    if (!isManager(actor) && deal.owner_id !== actor.id) throw new PermissionError("Only the deal's owner or a manager can add collaborators.");
    await requireExists(tx, "users", userId);
    await tx.execute(sql`insert into deal_collaborators (deal_id, user_id) values (${dealId}, ${userId}) on conflict do nothing`);
    await audit(tx, actor, "deal", dealId, "link", { collaboratorId: userId });
  });
}

export async function removeCollaborator(actor: Actor, dealId: string, userId: string) {
  await run(async (tx) => {
    const deal = await lockRow(tx, "deal", dealId);
    if (!isManager(actor) && deal.owner_id !== actor.id) throw new PermissionError("Only the deal's owner or a manager can remove collaborators.");
    await tx.execute(sql`delete from deal_collaborators where deal_id = ${dealId} and user_id = ${userId}`);
    await audit(tx, actor, "deal", dealId, "unlink", { collaboratorId: userId });
  });
}
