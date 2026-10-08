import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { ObjectType } from "@/db/schema";
import { NotFoundError } from "./errors";
import { fieldsFor, readFieldValue, type FieldSpec, type PropertyDefinitionLike } from "./fields";
import { TABLES, type Row } from "./records";

export type Option = { id: string; label: string };

export async function listStages() {
  const res = await db.execute(sql`select key, label, position, kind from pipeline_stages order by position`);
  return res.rows as { key: string; label: string; position: number; kind: string }[];
}

export async function listUsers(includeInactive = false) {
  const res = await db.execute(sql`
    select id, name, email, title, role, active from users ${includeInactive ? sql`` : sql`where active`} order by name`);
  return res.rows as { id: string; name: string; email: string | null; title: string | null; role: string; active: boolean }[];
}

export async function companyOptions(): Promise<Option[]> {
  const res = await db.execute(sql`select id, name as label from companies where deleted_at is null order by name`);
  return res.rows as Option[];
}

export async function contactOptions(): Promise<Option[]> {
  const res = await db.execute(sql`
    select id, trim(first_name || ' ' || coalesce(last_name, '')) || coalesce(' · ' || email, '') as label
    from contacts where deleted_at is null order by first_name, last_name`);
  return res.rows as Option[];
}

export async function listDefinitions(objectType?: ObjectType, includeArchived = false) {
  const res = await db.execute(sql`
    select id, object_type as "objectType", key, label, type, options, group_label as "groupLabel",
           extra_editor_roles as "extraEditorRoles", show_when as "showWhen", derive, edit_team_id as "editTeam", commercial, archived, position
    from property_definitions
    where true ${objectType ? sql`and object_type = ${objectType}` : sql``} ${includeArchived ? sql`` : sql`and not archived`}
    order by object_type, position`);
  return res.rows as (PropertyDefinitionLike & { id: string; objectType: ObjectType; position: number })[];
}

export async function getRecord(objectType: ObjectType, id: string): Promise<{ row: Row; specs: FieldSpec[]; values: Record<string, unknown> }> {
  const res = await db.execute(sql`select * from ${sql.identifier(TABLES[objectType])} where id = ${id} and deleted_at is null`);
  const row = res.rows[0] as Row | undefined;
  if (!row) throw new NotFoundError();
  const specs = fieldsFor(objectType, await listDefinitions(objectType));
  const values = Object.fromEntries(specs.map((s) => [s.key, readFieldValue(row, s)]));
  return { row, specs, values };
}

// ---------- deals ----------

export type DealCard = {
  id: string;
  name: string;
  stageKey: string;
  stageKind: string;
  amountMonthly: string | null;
  companyName: string | null;
  ownerName: string | null;
  ownerId: string | null;
  daysInStage: number;
  updatedAt: string;
};

export async function listDeals(opts: { ownerId?: string; q?: string } = {}): Promise<DealCard[]> {
  const like = opts.q ? `%${opts.q}%` : null;
  const res = await db.execute(sql`
    select d.id, d.name, d.stage_key as "stageKey", s.kind as "stageKind", d.amount_monthly as "amountMonthly", c.name as "companyName",
           u.name as "ownerName", d.owner_id as "ownerId",
           floor(extract(epoch from now() - d.stage_entered_at) / 86400)::int as "daysInStage",
           d.updated_at as "updatedAt"
    from deals d
    join pipeline_stages s on s.key = d.stage_key
    left join companies c on c.id = d.primary_company_id
    left join users u on u.id = d.owner_id
    where d.deleted_at is null
      ${opts.ownerId ? sql`and (d.owner_id = ${opts.ownerId} or exists (select 1 from deal_collaborators dc where dc.deal_id = d.id and dc.user_id = ${opts.ownerId}))` : sql``}
      ${like ? sql`and (d.name ilike ${like} or c.name ilike ${like})` : sql``}
    order by d.updated_at desc`);
  return res.rows as DealCard[];
}

export async function getDealLinks(dealId: string) {
  const [contacts, companies, collaborators] = await Promise.all([
    db.execute(sql`
      select dc.contact_id as id, dc.role, trim(c.first_name || ' ' || coalesce(c.last_name, '')) as name, c.email, c.phone
      from deal_contacts dc join contacts c on c.id = dc.contact_id
      where dc.deal_id = ${dealId} and c.deleted_at is null order by dc.role, name`),
    db.execute(sql`
      select dc.company_id as id, dc.role, c.name from deal_companies dc join companies c on c.id = dc.company_id
      where dc.deal_id = ${dealId} and c.deleted_at is null order by c.name`),
    db.execute(sql`
      select u.id, u.name from deal_collaborators dc join users u on u.id = dc.user_id where dc.deal_id = ${dealId} order by u.name`),
  ]);
  return {
    contacts: contacts.rows as { id: string; role: string; name: string; email: string | null; phone: string | null }[],
    companies: companies.rows as { id: string; role: string | null; name: string }[],
    collaborators: collaborators.rows as { id: string; name: string }[],
  };
}

export async function dealDaysInStage(dealId: string) {
  const res = await db.execute(sql`select floor(extract(epoch from now() - stage_entered_at) / 86400)::int as d from deals where id = ${dealId}`);
  return (res.rows[0]?.d as number) ?? 0;
}

// ---------- companies & contacts ----------

export async function listCompanies(q?: string) {
  const like = q ? `%${q}%` : null;
  const res = await db.execute(sql`
    select c.id, c.name, c.trading_name as "tradingName", c.company_type as "companyType", c.website, u.name as "ownerName",
      (select count(*)::int from deals d where d.primary_company_id = c.id and d.deleted_at is null) as "dealCount",
      (select count(*)::int from company_contacts cc where cc.company_id = c.id and cc.is_current) as "contactCount"
    from companies c left join users u on u.id = c.owner_id
    where c.deleted_at is null ${like ? sql`and (c.name ilike ${like} or c.trading_name ilike ${like} or c.website ilike ${like})` : sql``}
    order by c.name limit 500`);
  return res.rows as { id: string; name: string; tradingName: string | null; companyType: string | null; website: string | null; ownerName: string | null; dealCount: number; contactCount: number }[];
}

export async function listContacts(q?: string) {
  const like = q ? `%${q}%` : null;
  const res = await db.execute(sql`
    select p.id, trim(p.first_name || ' ' || coalesce(p.last_name, '')) as name, p.email, p.phone, p.job_title as "jobTitle",
      (select string_agg(c.name, ', ' order by c.name) from company_contacts cc join companies c on c.id = cc.company_id
        where cc.contact_id = p.id and cc.is_current and c.deleted_at is null) as companies
    from contacts p
    where p.deleted_at is null
      ${like ? sql`and (p.first_name ilike ${like} or p.last_name ilike ${like} or p.email ilike ${like} or p.phone ilike ${like})` : sql``}
    order by p.first_name, p.last_name limit 500`);
  return res.rows as { id: string; name: string; email: string | null; phone: string | null; jobTitle: string | null; companies: string | null }[];
}

export async function getCompanyRelations(companyId: string) {
  const [contacts, deals] = await Promise.all([
    db.execute(sql`
      select p.id, trim(p.first_name || ' ' || coalesce(p.last_name, '')) as name, p.email, p.phone, cc.role, cc.is_current as "isCurrent"
      from company_contacts cc join contacts p on p.id = cc.contact_id
      where cc.company_id = ${companyId} and p.deleted_at is null order by cc.is_current desc, name`),
    db.execute(sql`
      select d.id, d.name, s.label as "stageLabel", d.amount_monthly as "amountMonthly",
        case when d.primary_company_id = ${companyId} then 'Contracting company' when d.via_aggregator_id = ${companyId} then 'Aggregator' else coalesce(dc.role, 'Linked') end as relation
      from deals d join pipeline_stages s on s.key = d.stage_key
      left join deal_companies dc on dc.deal_id = d.id and dc.company_id = ${companyId}
      where d.deleted_at is null and (d.primary_company_id = ${companyId} or d.via_aggregator_id = ${companyId} or dc.company_id is not null)
      order by d.updated_at desc`),
  ]);
  return {
    contacts: contacts.rows as { id: string; name: string; email: string | null; phone: string | null; role: string | null; isCurrent: boolean }[],
    deals: deals.rows as { id: string; name: string; stageLabel: string; amountMonthly: string | null; relation: string }[],
  };
}

export async function getContactRelations(contactId: string) {
  const [companies, deals] = await Promise.all([
    db.execute(sql`
      select c.id, c.name, cc.role, cc.is_current as "isCurrent"
      from company_contacts cc join companies c on c.id = cc.company_id
      where cc.contact_id = ${contactId} and c.deleted_at is null order by cc.is_current desc, c.name`),
    db.execute(sql`
      select d.id, d.name, s.label as "stageLabel", dc.role
      from deal_contacts dc join deals d on d.id = dc.deal_id join pipeline_stages s on s.key = d.stage_key
      where dc.contact_id = ${contactId} and d.deleted_at is null order by d.updated_at desc`),
  ]);
  return {
    companies: companies.rows as { id: string; name: string; role: string | null; isCurrent: boolean }[],
    deals: deals.rows as { id: string; name: string; stageLabel: string; role: string }[],
  };
}

// ---------- activity, tasks, history ----------

export type ActivityItem = {
  id: string;
  type: string;
  subject: string | null;
  body: string | null;
  occurredAt: string;
  dueAt: string | null;
  completedAt: string | null;
  assignedToName: string | null;
  assignedTo: string | null;
  createdByName: string | null;
  createdBy: string | null;
};

export async function listActivities(parent: { dealId?: string; companyId?: string; contactId?: string }) {
  const where = parent.dealId
    ? sql`a.deal_id = ${parent.dealId}`
    : parent.companyId
      ? sql`(a.company_id = ${parent.companyId} or a.deal_id in (select id from deals where primary_company_id = ${parent.companyId}))`
      : sql`(a.contact_id = ${parent.contactId} or a.deal_id in (select deal_id from deal_contacts where contact_id = ${parent.contactId}))`;
  const res = await db.execute(sql`
    select a.id, a.type, a.subject, a.body, a.occurred_at as "occurredAt", a.due_at as "dueAt", a.completed_at as "completedAt",
           au.name as "assignedToName", a.assigned_to as "assignedTo", cu.name as "createdByName", a.created_by as "createdBy"
    from activities a left join users au on au.id = a.assigned_to left join users cu on cu.id = a.created_by
    where a.deleted_at is null and ${where}
    order by case when a.type = 'task' and a.completed_at is null then 0 else 1 end, coalesce(a.due_at, a.occurred_at) desc
    limit 200`);
  return res.rows as ActivityItem[];
}

export async function myOpenTasks(userId: string) {
  const res = await db.execute(sql`
    select a.id, a.subject, a.body, a.due_at as "dueAt", a.completed_at as "completedAt",
           a.deal_id as "dealId", d.name as "dealName", a.company_id as "companyId", c.name as "companyName",
           a.contact_id as "contactId", trim(p.first_name || ' ' || coalesce(p.last_name, '')) as "contactName"
    from activities a
    left join deals d on d.id = a.deal_id left join companies c on c.id = a.company_id left join contacts p on p.id = a.contact_id
    where a.deleted_at is null and a.type = 'task' and a.assigned_to = ${userId}
      and (a.completed_at is null or a.completed_at > now() - interval '7 days')
    order by a.completed_at nulls first, a.due_at nulls last`);
  return res.rows as {
    id: string; subject: string; body: string | null; dueAt: string | null; completedAt: string | null;
    dealId: string | null; dealName: string | null; companyId: string | null; companyName: string | null; contactId: string | null; contactName: string | null;
  }[];
}

export async function listHistory(objectType: ObjectType, id: string) {
  const res = await db.execute(sql`
    select a.id, a.action, a.field, a.old_value as "oldValue", a.new_value as "newValue", a.at, u.name as "userName"
    from audit_log a left join users u on u.id = a.user_id
    where a.object_type = ${objectType} and a.object_id = ${id} order by a.at desc, a.id desc limit 300`);
  return res.rows as { id: number; action: string; field: string | null; oldValue: unknown; newValue: unknown; at: string; userName: string | null }[];
}

// ---------- search ----------

export async function searchAll(q: string) {
  const term = q.trim();
  if (!term) return { deals: [], companies: [], contacts: [] };
  const [deals, companies, contacts] = await Promise.all([listDeals({ q: term }), listCompanies(term), listContacts(term)]);
  return { deals: deals.slice(0, 20), companies: companies.slice(0, 20), contacts: contacts.slice(0, 20) };
}
