import "server-only";
import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import type { Role } from "@/db/schema";
import type { Actor } from "./permissions";

// Sign-in for local development: pick yourself from a list. This is replaced by
// "Sign in with Microsoft" before anyone else uses KRM. It refuses to run in
// production unless AUTH_MODE is explicitly "dev".
const COOKIE = "krm_user";

export function devAuthEnabled() {
  return process.env.AUTH_MODE === "dev";
}

export async function hasAnyUsers() {
  const res = await db.execute(sql`select exists(select 1 from users) as e`);
  return res.rows[0].e as boolean;
}

export async function getActor(): Promise<Actor | null> {
  if (!devAuthEnabled()) return null;
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const res = await db.execute(sql`
    select u.id, u.name, u.role,
           coalesce(array_agg(t.id) filter (where t.id is not null), '{}') as team_ids,
           coalesce(bool_or(t.sees_commercials), false) as sees
    from users u left join team_members m on m.user_id = u.id left join teams t on t.id = m.team_id
    where u.id = ${id} and u.active group by u.id`);
  const u = res.rows[0];
  return u
    ? { id: u.id as string, name: u.name as string, role: u.role as Role, teamIds: u.team_ids as string[], teamSeesCommercials: u.sees as boolean }
    : null;
}

// Use at the top of every page and server action that needs a signed-in person.
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (actor) return actor;
  redirect((await hasAnyUsers()) ? "/sign-in" : "/setup");
}

export async function signInAs(userId: string) {
  if (!devAuthEnabled()) throw new Error("Development sign-in is switched off.");
  (await cookies()).set(COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
}

export async function signOut() {
  (await cookies()).delete(COOKIE);
}
