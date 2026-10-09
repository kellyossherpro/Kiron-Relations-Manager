import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { makeUser, resetDb } from "@/test/helpers";
import { logActivity, setTaskDone } from "./activities";
import { createFieldDefinition, createFirstAdmin, createUser, updateFieldDefinition, updateUser } from "./admin";
import { PermissionError, RuleError } from "./errors";
import { addCollaborator, addDealContact, linkContactToCompany, setContactCurrent } from "./links";
import { createRecord } from "./records";

beforeEach(resetDb);
afterAll(() => pool.end());

describe("links", () => {
  it("links a contact to several companies and keeps past employers", async () => {
    const sales = await makeUser("sales");
    const a = await createRecord(sales, "company", { name: "First Co" });
    const b = await createRecord(sales, "company", { name: "Second Co" });
    const p = await createRecord(sales, "contact", { firstName: "Alex", email: "alex@example.test" });
    await linkContactToCompany(sales, a, p, "Head of Ops");
    await linkContactToCompany(sales, b, p, "Consultant");
    await setContactCurrent(sales, a, p, false);
    const res = await db.execute(sql`select company_id, is_current from company_contacts where contact_id = ${p} order by is_current`);
    expect(res.rows).toEqual([
      { company_id: a, is_current: false },
      { company_id: b, is_current: true },
    ]);
  });

  it("gives deal contacts a role, and only deal editors can change them", async () => {
    const owner = await makeUser("sales");
    const other = await makeUser("sales");
    const deal = await createRecord(owner, "deal", { name: "Roles" });
    const p = await createRecord(other, "contact", { firstName: "Fin", email: "fin@example.test" });
    await addDealContact(owner, deal, p, "finance");
    await expect(addDealContact(other, deal, p, "support")).rejects.toThrow(PermissionError);
    await expect(addDealContact(owner, deal, p, "boss")).rejects.toThrow(RuleError);
  });

  it("lets the owner add collaborators, who can then edit", async () => {
    const owner = await makeUser("sales");
    const collab = await makeUser("account_manager");
    const deal = await createRecord(owner, "deal", { name: "Team" });
    await expect(addCollaborator(collab, deal, collab.id)).rejects.toThrow(PermissionError);
    await addCollaborator(owner, deal, collab.id);
    const p = await createRecord(owner, "contact", { firstName: "Sup", phone: "123" });
    await expect(addDealContact(collab, deal, p, "support")).resolves.toBeUndefined();
  });
});

describe("activities and tasks", () => {
  it("logs notes, and assigns tasks to their creator by default", async () => {
    const sales = await makeUser("sales");
    const deal = await createRecord(sales, "deal", { name: "Busy" });
    await logActivity(sales, { type: "note", body: "Spoke to the client", dealId: deal });
    const t = await logActivity(sales, { type: "task", subject: "Send proposal", dueAt: "2026-11-01", dealId: deal });
    const res = await db.execute(sql`select assigned_to from activities where id = ${t}`);
    expect(res.rows[0].assigned_to).toBe(sales.id);
  });

  it("refuses empty notes and tasks without a description", async () => {
    const sales = await makeUser("sales");
    const deal = await createRecord(sales, "deal", { name: "Quiet" });
    await expect(logActivity(sales, { type: "note", body: "  ", dealId: deal })).rejects.toThrow(RuleError);
    await expect(logActivity(sales, { type: "task", dealId: deal })).rejects.toThrow(RuleError);
  });

  it("only lets the assignee, creator or a manager complete a task", async () => {
    const a = await makeUser("sales");
    const b = await makeUser("sales");
    const deal = await createRecord(a, "deal", { name: "Tasks" });
    const t = await logActivity(a, { type: "task", subject: "Call back", dealId: deal });
    await expect(setTaskDone(b, t, true)).rejects.toThrow(PermissionError);
    await setTaskDone(a, t, true);
    const res = await db.execute(sql`select completed_at from activities where id = ${t}`);
    expect(res.rows[0].completed_at).not.toBeNull();
  });
});

describe("setup and admin", () => {
  it("makes the first person an admin, and only the first", async () => {
    await createFirstAdmin("First Person", "first@example.test");
    await expect(createFirstAdmin("Second Person", "second@example.test")).rejects.toThrow(/already set up/);
    const res = await db.execute(sql`select role from users`);
    expect(res.rows).toEqual([{ role: "admin" }]);
  });

  it("never removes the last admin", async () => {
    const admin = await makeUser("admin");
    await expect(updateUser(admin, admin.id, { role: "sales" })).rejects.toThrow(/at least one admin/);
    const other = await createUser(admin, { name: "Other", email: "other@example.test", role: "admin" });
    await updateUser(admin, admin.id, { role: "sales" });
    expect(other).toBeTruthy();
  });

  it("lets admins add, rename and archive fields but not others", async () => {
    const admin = await makeUser("admin");
    const sales = await makeUser("sales");
    await expect(createFieldDefinition(sales, { objectType: "deal", label: "Tier", type: "text" })).rejects.toThrow(PermissionError);
    const id = await createFieldDefinition(admin, { objectType: "deal", label: "Customer tier", type: "select", options: ["1", "2", "3", "4"] });
    await updateFieldDefinition(admin, id!, { label: "Tier", archived: true });
    const res = await db.execute(sql`select key, label, archived from property_definitions where id = ${id}`);
    expect(res.rows[0]).toEqual({ key: "customer_tier", label: "Tier", archived: true });
    await expect(createFieldDefinition(admin, { objectType: "deal", label: "Dropdown", type: "select", options: [] })).rejects.toThrow(/at least one option/);
  });
});
