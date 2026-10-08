import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Roles, from least to most access. See src/lib/permissions.ts for what each can do.
export const ROLES = ["viewer", "legal", "sales", "account_manager", "manager", "admin"] as const;
export type Role = (typeof ROLES)[number];

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// Shared columns for the three main records. `version` goes up by one on every save,
// `properties` holds the admin-defined fields (see property_definitions), and
// `deleted_at` makes deletes reversible.
const recordColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").references(() => users.id),
  properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
  version: integer("version").notNull().default(1),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role").$type<Role>().notNull().default("viewer"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_unique").on(sql`lower(${t.email})`)],
);

export const companies = pgTable(
  "companies",
  {
    ...recordColumns,
    name: text("name").notNull(), // legal entity name: what identifies a company
    tradingName: text("trading_name"),
    companyType: text("company_type").$type<"retail" | "online" | "both">(),
    website: text("website"),
    parentId: uuid("parent_id").references((): AnyPgColumn => companies.id),
  },
  (t) => [
    uniqueIndex("companies_name_unique").on(sql`lower(${t.name})`).where(sql`${t.deletedAt} is null`),
    check("companies_website_required_online", sql`${t.companyType} is null or ${t.companyType} = 'retail' or ${t.website} is not null`),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    ...recordColumns,
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    jobTitle: text("job_title"),
  },
  (t) => [
    uniqueIndex("contacts_email_unique").on(sql`lower(${t.email})`).where(sql`${t.deletedAt} is null and ${t.email} is not null`),
    check("contacts_email_or_phone", sql`${t.email} is not null or ${t.phone} is not null`),
  ],
);

// A contact can belong to several companies, each with a role and a "current" flag.
export const companyContacts = pgTable(
  "company_contacts",
  {
    companyId: uuid("company_id").notNull().references(() => companies.id),
    contactId: uuid("contact_id").notNull().references(() => contacts.id),
    role: text("role"),
    isCurrent: boolean("is_current").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.contactId] })],
);

// Pipeline stages are configuration, not data. Kept in a table so admins can rename them.
export const STAGE_KINDS = ["open", "won", "live", "change", "parked", "lost", "terminated"] as const;
export const pipelineStages = pgTable("pipeline_stages", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  position: integer("position").notNull(),
  kind: text("kind").$type<(typeof STAGE_KINDS)[number]>().notNull(),
});

export const deals = pgTable(
  "deals",
  {
    ...recordColumns,
    name: text("name").notNull(),
    stageKey: text("stage_key").notNull().references(() => pipelineStages.key),
    stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true }).notNull().defaultNow(),
    amountMonthly: numeric("amount_monthly", { precision: 14, scale: 2 }),
    primaryCompanyId: uuid("primary_company_id").references(() => companies.id),
    viaAggregatorId: uuid("via_aggregator_id").references(() => companies.id),
  },
  (t) => [index("deals_stage_idx").on(t.stageKey), index("deals_owner_idx").on(t.ownerId)],
);

// Other companies on a deal (the primary/contracting company lives on the deal itself).
export const dealCompanies = pgTable(
  "deal_companies",
  {
    dealId: uuid("deal_id").notNull().references(() => deals.id),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    role: text("role"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.dealId, t.companyId] })],
);

export const DEAL_CONTACT_ROLES = ["primary", "finance", "marketing", "support", "other"] as const;
export const dealContacts = pgTable(
  "deal_contacts",
  {
    dealId: uuid("deal_id").notNull().references(() => deals.id),
    contactId: uuid("contact_id").notNull().references(() => contacts.id),
    role: text("role").$type<(typeof DEAL_CONTACT_ROLES)[number]>().notNull().default("other"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.dealId, t.contactId, t.role] })],
);

export const dealCollaborators = pgTable(
  "deal_collaborators",
  {
    dealId: uuid("deal_id").notNull().references(() => deals.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.dealId, t.userId] })],
);

// Fields that admins add themselves (no code change needed). Values live in each
// record's `properties` under `key`.
export const OBJECT_TYPES = ["company", "contact", "deal"] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];
export const FIELD_TYPES = ["text", "textarea", "number", "money", "date", "select", "multiselect", "yesno", "url", "email"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const propertyDefinitions = pgTable(
  "property_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    objectType: text("object_type").$type<ObjectType>().notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type").$type<FieldType>().notNull(),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    groupLabel: text("group_label"),
    position: integer("position").notNull().default(0),
    // Roles that may edit this field even when they don't own the record (e.g. "legal").
    extraEditorRoles: jsonb("extra_editor_roles").$type<string[]>().notNull().default([]),
    // Only show the field when another field has one of these answers (e.g. "Server name"
    // only when "Dedicated server" is Yes). Null = always shown.
    showWhen: jsonb("show_when").$type<{ field: string; values: string[] }>(),
    archived: boolean("archived").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("property_definitions_key_unique").on(t.objectType, t.key)],
);

export const ACTIVITY_TYPES = ["note", "call", "meeting", "task", "email"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").$type<ActivityType>().notNull(),
    subject: text("subject"),
    body: text("body"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    assignedTo: uuid("assigned_to").references(() => users.id),
    dealId: uuid("deal_id").references(() => deals.id),
    companyId: uuid("company_id").references(() => companies.id),
    contactId: uuid("contact_id").references(() => contacts.id),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("activities_deal_idx").on(t.dealId),
    index("activities_company_idx").on(t.companyId),
    index("activities_contact_idx").on(t.contactId),
    index("activities_assigned_idx").on(t.assignedTo),
    check("activities_has_parent", sql`${t.dealId} is not null or ${t.companyId} is not null or ${t.contactId} is not null`),
  ],
);

// Every change, field by field: who, what, when, old and new value.
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    objectType: text("object_type").notNull(),
    objectId: uuid("object_id").notNull(),
    action: text("action").notNull(),
    field: text("field"),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    userId: uuid("user_id").references(() => users.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_object_idx").on(t.objectType, t.objectId, t.at)],
);

// ---------- stage rules ----------

// What a deal needs before it can leave a stage. `kind`:
// - field: the field (built-in key or "p.<key>") must be filled in, or have one of
//   `required_values` (e.g. "Technical review performed" must be Yes)
// - has_contact: at least one contact on the deal (optionally with a given role)
// - has_primary_company: the contracting company is set
// - has_collaborator: at least one collaborator
// A requirement can apply only when another field has a given value ("when").
export const REQUIREMENT_KINDS = ["field", "has_contact", "has_primary_company", "has_collaborator"] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

export const stageRequirements = pgTable(
  "stage_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stageKey: text("stage_key").notNull().references(() => pipelineStages.key),
    kind: text("kind").$type<RequirementKind>().notNull(),
    fieldKey: text("field_key"),
    contactRole: text("contact_role"),
    whenField: text("when_field"),
    whenValue: text("when_value"),
    // For kind "field": the answers that count (e.g. ["Yes"]). Empty = any answer counts.
    requiredValues: jsonb("required_values").$type<string[]>(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stage_requirements_stage_idx").on(t.stageKey)],
);

// Where a deal goes when its stage is complete. Checked in order; the first whose
// condition matches wins. No condition = always.
export const stageTransitions = pgTable(
  "stage_transitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromStage: text("from_stage").notNull().references(() => pipelineStages.key),
    toStage: text("to_stage").notNull().references(() => pipelineStages.key),
    whenField: text("when_field"),
    whenValue: text("when_value"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stage_transitions_from_idx").on(t.fromStage)],
);

// The in-CRM notification board: one row per person per alert.
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    kind: text("kind").notNull(), // stage_auto, stage_stale, on_hold_auto, closed_lost_auto
    dealId: uuid("deal_id").references(() => deals.id),
    stageKey: text("stage_key"),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt), index("notifications_deal_idx").on(t.dealId, t.kind)],
);

// ---------- addendums ----------

// A change to money or the contract on a live deal (see the sales playbook's
// "Addendums & Changes"). Operational changes are tasks, not addendums.
export const ADDENDUM_TYPES = ["commercial", "new_product", "platform", "market", "term", "legal_entity"] as const;
export type AddendumType = (typeof ADDENDUM_TYPES)[number];
export const ADDENDUM_STATUSES = ["open", "done", "cancelled"] as const;
export type AddendumStatus = (typeof ADDENDUM_STATUSES)[number];

// One row per trip through the addendum loop. Raising one moves the deal to the
// Addendum stage; finishing or cancelling it sends the deal back to `from_stage`.
// Past addendums stay here, so nothing on the deal needs resetting.
export const addendums = pgTable(
  "addendums",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id").notNull().references(() => deals.id),
    type: text("type").$type<AddendumType>().notNull(),
    details: text("details").notNull(),
    fromStage: text("from_stage").notNull().references(() => pipelineStages.key),
    status: text("status").$type<AddendumStatus>().notNull().default("open"),
    raisedBy: uuid("raised_by").references(() => users.id),
    raisedAt: timestamp("raised_at", { withTimezone: true }).notNull().defaultNow(),
    closedBy: uuid("closed_by").references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closeNote: text("close_note"),
  },
  (t) => [
    index("addendums_deal_idx").on(t.dealId, t.raisedAt),
    uniqueIndex("addendums_one_open").on(t.dealId).where(sql`${t.status} = 'open'`),
  ],
);
