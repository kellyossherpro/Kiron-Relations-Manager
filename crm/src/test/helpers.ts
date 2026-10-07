import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { Role } from "@/db/schema";
import type { Actor } from "@/lib/permissions";

// Empties every table except the stage configuration.
export async function resetDb() {
  await db.execute(sql`truncate addendums, notifications, audit_log, activities, deal_collaborators, deal_contacts, deal_companies, company_contacts, deals, contacts, companies, property_definitions, users restart identity cascade`);
}

let n = 0;
export async function makeUser(role: Role, name?: string): Promise<Actor> {
  n += 1;
  const label = name ?? `${role} ${n}`;
  const res = await db.execute(sql`insert into users (name, email, role) values (${label}, ${`user${n}@example.test`}, ${role}) returning id`);
  return { id: res.rows[0].id as string, role, name: label };
}
