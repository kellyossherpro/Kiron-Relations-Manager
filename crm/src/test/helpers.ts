import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { Role } from "@/db/schema";
import type { Actor } from "@/lib/permissions";

// Empties every table and puts the stage settings back to how KRM ships: the stage list,
// the straight-line routes, no requirements and no settings.
export async function resetDb() {
  await db.execute(sql`truncate addendums, notifications, audit_log, activities, deal_collaborators, deal_contacts, deal_companies, company_contacts, deals, contacts, companies, property_definitions, users restart identity cascade`);
  await db.execute(sql`delete from stage_requirements; delete from app_settings; delete from stage_transitions`);
  await db.execute(sql`
    insert into stage_transitions (from_stage, to_stage, position) values
      ('lead','customer_engagement',1), ('customer_engagement','qualified_lead',1), ('qualified_lead','proposal',1),
      ('feasibility','proposal',1), ('proposal','legal_compliance',1), ('legal_compliance','closed_won',1), ('closed_won','live_direct',1)`);
}

let n = 0;
export async function makeUser(role: Role, name?: string): Promise<Actor> {
  n += 1;
  const label = name ?? `${role} ${n}`;
  const res = await db.execute(sql`insert into users (name, email, role) values (${label}, ${`user${n}@example.test`}, ${role}) returning id`);
  return { id: res.rows[0].id as string, role, name: label };
}
