import { sql } from "drizzle-orm";
import { db } from "@/db";
import { TEAM_KINDS, type Role } from "@/db/schema";
import { PermissionError, RuleError, translateDbError } from "./errors";
import { KIRON_ORG } from "./kiron-org";
import { canManageUsersAndFields, type Actor } from "./permissions";

// Departments (from the organogram) and groups (people with a job in KRM, like signing off a
// deal's technical review). Admins look after both in Admin → Departments & groups.

export type TeamKind = (typeof TEAM_KINDS)[number];
export type TeamMember = { id: string; name: string; title: string | null };
export type Team = { id: string; name: string; kind: TeamKind; seesCommercials: boolean; members: TeamMember[]; fields: string[] };

// The group that signs off "Technical review performed". Oswald and Craig to start with; admins
// add backups for when they're away (Kelly, 2026-10-08: "someone will still need to sign off").
export const TECH_REVIEWERS = "Technical reviewers";
export const TECH_REVIEWERS_START = ["Oswald Whelpton", "Craig Jennison"];

// What each department can do in KRM to start with (admins change anyone's role in Admin → People).
export const DEPARTMENT_ROLES: Record<string, Role> = {
  Executive: "manager",
  Commercial: "manager",
  Sales: "sales",
  "Sales - North America": "sales",
  "Account Management": "account_manager",
  "Risk, Legal, & Compliance": "legal",
};
// Departments whose people see fees and rates even though their role is read-only.
export const DEPARTMENTS_SEEING_FEES = ["Finance"];
// KRM's owner.
const ADMINS = ["Kelly Ossher"];

function requireAdmin(actor: Actor) {
  if (!canManageUsersAndFields(actor)) throw new PermissionError("Only an admin can change departments and groups.");
}

export async function listTeams(): Promise<Team[]> {
  const [teams, members, fields] = await Promise.all([
    db.execute(sql`select id, name, kind, sees_commercials as "seesCommercials" from teams order by kind desc, lower(name)`),
    db.execute(sql`
      select m.team_id, u.id, u.name, u.title from team_members m join users u on u.id = m.user_id
      where u.active order by lower(u.name)`),
    db.execute(sql`select edit_team_id, label from property_definitions where edit_team_id is not null and not archived order by label`),
  ]);
  return teams.rows.map((t) => ({
    ...(t as { id: string; name: string; kind: TeamKind; seesCommercials: boolean }),
    members: members.rows.filter((m) => m.team_id === t.id).map((m) => ({ id: m.id as string, name: m.name as string, title: (m.title as string | null) ?? null })),
    fields: fields.rows.filter((f) => f.edit_team_id === t.id).map((f) => f.label as string),
  }));
}

// Every person's departments and groups, for the People table.
export async function teamNamesByUser(): Promise<Record<string, string[]>> {
  const res = await db.execute(sql`
    select m.user_id, t.name from team_members m join teams t on t.id = m.team_id order by t.kind, lower(t.name)`);
  const out: Record<string, string[]> = {};
  for (const r of res.rows) (out[r.user_id as string] ??= []).push(r.name as string);
  return out;
}

export async function createTeam(actor: Actor, input: { name: string; kind: TeamKind }) {
  requireAdmin(actor);
  const name = input.name.trim();
  if (!name) throw new RuleError("Give it a name.");
  if (!TEAM_KINDS.includes(input.kind)) throw new RuleError("Pick department or group.");
  try {
    const res = await db.execute(sql`insert into teams (name, kind) values (${name}, ${input.kind}) returning id`);
    return res.rows[0].id as string;
  } catch (err) {
    translateDbError(err);
  }
}

export async function updateTeam(actor: Actor, teamId: string, input: { name?: string; seesCommercials?: boolean }) {
  requireAdmin(actor);
  const name = input.name?.trim();
  if (input.name !== undefined && !name) throw new RuleError("Give it a name.");
  try {
    const res = await db.execute(sql`
      update teams set name = coalesce(${name ?? null}, name), sees_commercials = coalesce(${input.seesCommercials ?? null}, sees_commercials), updated_at = now()
      where id = ${teamId} returning id`);
    if (!res.rows[0]) throw new RuleError("That department or group doesn't exist.");
  } catch (err) {
    translateDbError(err);
  }
}

// A group that signs off a field can't be removed: the field would quietly open up to everyone.
export async function deleteTeam(actor: Actor, teamId: string) {
  requireAdmin(actor);
  const used = await db.execute(sql`select label from property_definitions where edit_team_id = ${teamId} order by label`);
  if (used.rows.length) {
    throw new RuleError(`It signs off ${used.rows.map((r) => `"${r.label}"`).join(", ")}. Give that to another group in Admin → Fields first.`);
  }
  await db.execute(sql`delete from teams where id = ${teamId}`);
}

export async function addTeamMember(actor: Actor, teamId: string, userId: string) {
  requireAdmin(actor);
  const ok = await db.execute(sql`select (select 1 from teams where id = ${teamId}) as t, (select 1 from users where id = ${userId}) as u`);
  if (!ok.rows[0].t) throw new RuleError("That department or group doesn't exist.");
  if (!ok.rows[0].u) throw new RuleError("Pick a person.");
  await db.execute(sql`insert into team_members (team_id, user_id) values (${teamId}, ${userId}) on conflict do nothing`);
}

export async function removeTeamMember(actor: Actor, teamId: string, userId: string) {
  requireAdmin(actor);
  await db.execute(sql`delete from team_members where team_id = ${teamId} and user_id = ${userId}`);
}

// Finds a group by name, making it if it's not there yet (used by the playbook setup).
export async function ensureGroup(name: string): Promise<string> {
  const res = await db.execute(sql`
    insert into teams (name, kind) values (${name}, 'group')
    on conflict (lower(name)) do update set updated_at = teams.updated_at returning id`);
  return res.rows[0].id as string;
}

export type OrgSetupResult = { departments: number; peopleAdded: number; peopleFound: number };

/**
 * One click: Kiron's departments and people from the organogram, plus the technical
 * reviewers group. Safe to run again: it only adds what's missing, and never changes the
 * role of someone who's already in KRM. People are matched by name; nobody gets an email
 * address here (they're matched to their Microsoft account when they first sign in).
 */
export async function applyKironOrg(actor: Actor): Promise<OrgSetupResult> {
  requireAdmin(actor);
  return db.transaction(async (tx) => {
    const existing = await tx.execute(sql`select id, name from users`);
    const userByName = new Map(existing.rows.map((r) => [(r.name as string).trim().toLowerCase(), r.id as string]));
    const result: OrgSetupResult = { departments: 0, peopleAdded: 0, peopleFound: 0 };
    const counted = new Set<string>();

    for (const dept of KIRON_ORG) {
      const team = await tx.execute(sql`
        insert into teams (name, kind, sees_commercials) values (${dept.name}, 'department', ${DEPARTMENTS_SEEING_FEES.includes(dept.name)})
        on conflict (lower(name)) do update set updated_at = teams.updated_at returning id`);
      const teamId = team.rows[0].id as string;
      result.departments++;
      for (const p of dept.people) {
        const key = p.name.trim().toLowerCase();
        let userId = userByName.get(key);
        if (!userId) {
          const role: Role = ADMINS.includes(p.name) ? "admin" : (DEPARTMENT_ROLES[dept.name] ?? "viewer");
          const res = await tx.execute(sql`
            insert into users (name, role, title, reports_to) values (${p.name}, ${role}, ${p.title}, ${p.reportsTo ?? null}) returning id`);
          userId = res.rows[0].id as string;
          userByName.set(key, userId);
          result.peopleAdded++;
        } else if (!counted.has(key)) {
          // Already in KRM (e.g. the admin who set it up): fill in the job title, keep everything else.
          await tx.execute(sql`
            update users set title = coalesce(title, ${p.title}), reports_to = coalesce(reports_to, ${p.reportsTo ?? null}), updated_at = now()
            where id = ${userId}`);
          result.peopleFound++;
        }
        counted.add(key);
        await tx.execute(sql`insert into team_members (team_id, user_id) values (${teamId}, ${userId}) on conflict do nothing`);
      }
    }

    const group = await tx.execute(sql`
      insert into teams (name, kind) values (${TECH_REVIEWERS}, 'group')
      on conflict (lower(name)) do update set updated_at = teams.updated_at returning id`);
    for (const name of TECH_REVIEWERS_START) {
      const userId = userByName.get(name.toLowerCase());
      if (userId) await tx.execute(sql`insert into team_members (team_id, user_id) values (${group.rows[0].id as string}, ${userId}) on conflict do nothing`);
    }
    return result;
  });
}
