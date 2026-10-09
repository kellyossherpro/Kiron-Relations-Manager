import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { makeUser, resetDb } from "@/test/helpers";
import { createFieldDefinition } from "./admin";
import { RuleError, PermissionError } from "./errors";
import { FieldError } from "./fields";
import { createRecord, deleteRecord, moveDealStage, restoreRecord, updateRecord } from "./records";

beforeEach(resetDb);
afterAll(() => pool.end());

async function row(table: string, id: string) {
  const res = await db.execute(sql`select * from ${sql.identifier(table)} where id = ${id}`);
  return res.rows[0] as Record<string, unknown>;
}

describe("creating records", () => {
  it("creates a company owned by its creator, with history", async () => {
    const sales = await makeUser("sales");
    const id = await createRecord(sales, "company", { name: "Example Gaming Ltd", companyType: "retail" });
    const c = await row("companies", id);
    expect(c.owner_id).toBe(sales.id);
    expect(c.version).toBe(1);
    const log = await db.execute(sql`select action from audit_log where object_id = ${id}`);
    expect(log.rows.map((r) => r.action)).toEqual(["create"]);
  });

  it("requires a website for online companies but not retail", async () => {
    const sales = await makeUser("sales");
    await expect(createRecord(sales, "company", { name: "Online Co", companyType: "online" })).rejects.toThrow(/need a website/);
    await expect(createRecord(sales, "company", { name: "Shop Co", companyType: "retail" })).resolves.toBeTruthy();
  });

  it("blocks a second company with the same legal name, ignoring case", async () => {
    const sales = await makeUser("sales");
    await createRecord(sales, "company", { name: "Same Name Ltd" });
    await expect(createRecord(sales, "company", { name: "same name ltd" })).rejects.toThrow(RuleError);
  });

  it("needs an email or a phone number on a contact", async () => {
    const sales = await makeUser("sales");
    await expect(createRecord(sales, "contact", { firstName: "Sam" })).rejects.toThrow(/email address or a phone/);
    await expect(createRecord(sales, "contact", { firstName: "Sam", phone: "+27 00 000 0000" })).resolves.toBeTruthy();
  });

  it("starts deals in the first open stage", async () => {
    const sales = await makeUser("sales");
    const id = await createRecord(sales, "deal", { name: "Test deal" });
    expect((await row("deals", id)).stage_key).toBe("lead");
  });

  it("does not let viewers create records", async () => {
    const viewer = await makeUser("viewer");
    await expect(createRecord(viewer, "company", { name: "Nope Ltd" })).rejects.toThrow(PermissionError);
  });

  it("rejects bad values with a readable message", async () => {
    const sales = await makeUser("sales");
    await expect(createRecord(sales, "deal", { name: "D", amountMonthly: "lots" })).rejects.toThrow(FieldError);
  });
});

describe("two people editing at once", () => {
  it("keeps both changes when people edit different fields", async () => {
    const owner = await makeUser("sales");
    const manager = await makeUser("manager");
    const id = await createRecord(owner, "company", { name: "Two Editors Ltd" });

    // Both opened the form while the website and trading name were empty.
    const a = await updateRecord(owner, "company", id, { website: "example.test" }, { website: null });
    const b = await updateRecord(manager, "company", id, { tradingName: "Two Eds" }, { tradingName: null });

    expect(a.status).toBe("saved");
    expect(b.status).toBe("saved");
    const c = await row("companies", id);
    expect(c.website).toBe("https://example.test");
    expect(c.trading_name).toBe("Two Eds");
    expect(c.version).toBe(3);
  });

  it("asks the second person to choose when both change the same field", async () => {
    const owner = await makeUser("sales");
    const manager = await makeUser("manager");
    const id = await createRecord(owner, "deal", { name: "Clash", amountMonthly: "1000" });

    const first = await updateRecord(owner, "deal", id, { amountMonthly: "2000" }, { amountMonthly: "1000.00" });
    const second = await updateRecord(manager, "deal", id, { amountMonthly: "3000" }, { amountMonthly: "1000.00" });

    expect(first.status).toBe("saved");
    expect(second).toMatchObject({ status: "conflict", conflicts: [{ field: "amountMonthly", theirs: "2000.00", yours: "3000.00" }] });
    expect((await row("deals", id)).amount_monthly).toBe("2000.00");

    // The manager chooses to keep their value: they save again against what they now see.
    const retry = await updateRecord(manager, "deal", id, { amountMonthly: "3000" }, { amountMonthly: "2000.00" });
    expect(retry.status).toBe("saved");
    expect((await row("deals", id)).amount_monthly).toBe("3000.00");
  });

  it("saves nothing at all when any field in the save conflicts", async () => {
    const owner = await makeUser("sales");
    const id = await createRecord(owner, "company", { name: "Atomic Ltd" });
    await updateRecord(owner, "company", id, { tradingName: "First" }, { tradingName: null });
    const res = await updateRecord(owner, "company", id, { tradingName: "Second", website: "atomic.test" }, { tradingName: null, website: null });
    expect(res.status).toBe("conflict");
    expect((await row("companies", id)).website).toBeNull();
  });

  it("lets exactly one of two simultaneous saves to the same field win", async () => {
    const owner = await makeUser("sales");
    const manager = await makeUser("manager");
    const id = await createRecord(owner, "deal", { name: "Race" });

    const results = await Promise.all([
      updateRecord(owner, "deal", id, { amountMonthly: "100" }, { amountMonthly: null }),
      updateRecord(manager, "deal", id, { amountMonthly: "200" }, { amountMonthly: null }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["conflict", "saved"]);
    expect((await row("deals", id)).version).toBe(2);
  });

  it("treats saving the value that is already there as a no-op, not a conflict", async () => {
    const owner = await makeUser("sales");
    const id = await createRecord(owner, "company", { name: "Same Value Ltd" });
    await updateRecord(owner, "company", id, { tradingName: "X" }, { tradingName: null });
    const again = await updateRecord(owner, "company", id, { tradingName: "X" }, { tradingName: null });
    expect(again.status).toBe("saved");
    expect((await row("companies", id)).version).toBe(2);
  });

  it("records every changed field in the history", async () => {
    const owner = await makeUser("sales");
    const id = await createRecord(owner, "company", { name: "History Ltd" });
    await updateRecord(owner, "company", id, { tradingName: "H", website: "h.test" }, { tradingName: null, website: null });
    const log = await db.execute(sql`select field, old_value, new_value, user_id from audit_log where object_id = ${id} and action = 'update' order by field`);
    expect(log.rows).toEqual([
      { field: "tradingName", old_value: null, new_value: "H", user_id: owner.id },
      { field: "website", old_value: null, new_value: "https://h.test", user_id: owner.id },
    ]);
  });
});

describe("custom fields added by an admin", () => {
  it("stores, validates and conflict-checks custom fields like built-in ones", async () => {
    const admin = await makeUser("admin");
    const owner = await makeUser("sales");
    await createFieldDefinition(admin, { objectType: "deal", label: "Billing currency", type: "select", options: ["USD", "EUR", "ZAR"] });
    const id = await createRecord(owner, "deal", { name: "Custom", "p.billing_currency": "USD" });

    await expect(updateRecord(owner, "deal", id, { "p.billing_currency": "GBP" }, { "p.billing_currency": "USD" })).rejects.toThrow(/isn't an option/);
    const ok = await updateRecord(owner, "deal", id, { "p.billing_currency": "EUR" }, { "p.billing_currency": "USD" });
    expect(ok.status).toBe("saved");
    expect((await row("deals", id)).properties).toEqual({ billing_currency: "EUR" });

    const clash = await updateRecord(admin, "deal", id, { "p.billing_currency": "ZAR" }, { "p.billing_currency": "USD" });
    expect(clash.status).toBe("conflict");
  });
});

describe("who can edit what", () => {
  it("lets sales edit their own deals but not someone else's", async () => {
    const mine = await makeUser("sales");
    const other = await makeUser("sales");
    const id = await createRecord(mine, "deal", { name: "Mine" });
    await expect(updateRecord(other, "deal", id, { name: "Taken" }, { name: "Mine" })).rejects.toThrow(PermissionError);
  });

  it("lets collaborators edit the deal", async () => {
    const owner = await makeUser("sales");
    const collab = await makeUser("account_manager");
    const id = await createRecord(owner, "deal", { name: "Shared" });
    await db.execute(sql`insert into deal_collaborators (deal_id, user_id) values (${id}, ${collab.id})`);
    const res = await updateRecord(collab, "deal", id, { name: "Shared deal" }, { name: "Shared" });
    expect(res.status).toBe("saved");
  });

  it("lets legal edit only the fields opened to legal", async () => {
    const admin = await makeUser("admin");
    const owner = await makeUser("sales");
    const legal = await makeUser("legal");
    await createFieldDefinition(admin, { objectType: "deal", label: "Agreement signed", type: "yesno", extraEditorRoles: ["legal"] });
    const id = await createRecord(owner, "deal", { name: "Legal deal" });
    const ok = await updateRecord(legal, "deal", id, { "p.agreement_signed": "yes" }, { "p.agreement_signed": null });
    expect(ok.status).toBe("saved");
    await expect(updateRecord(legal, "deal", id, { name: "Changed" }, { name: "Legal deal" })).rejects.toThrow(PermissionError);
  });

  it("only lets the owner or a manager hand a record to someone else", async () => {
    const owner = await makeUser("sales");
    const collab = await makeUser("sales");
    const id = await createRecord(owner, "deal", { name: "Handover" });
    await db.execute(sql`insert into deal_collaborators (deal_id, user_id) values (${id}, ${collab.id})`);
    await expect(updateRecord(collab, "deal", id, { ownerId: collab.id }, { ownerId: owner.id })).rejects.toThrow(PermissionError);
    expect((await updateRecord(owner, "deal", id, { ownerId: collab.id }, { ownerId: owner.id })).status).toBe("saved");
  });
});

describe("moving deals between stages", () => {
  it("only lets managers move deals between normal stages, with a reason", async () => {
    const owner = await makeUser("sales");
    const manager = await makeUser("manager");
    const id = await createRecord(owner, "deal", { name: "Mover" });
    await expect(moveDealStage(owner, id, "proposal", { expectedStage: "lead", reason: "skip" })).rejects.toThrow(PermissionError);
    await expect(moveDealStage(manager, id, "proposal", { expectedStage: "lead", reason: " " })).rejects.toThrow(/reason/);
    expect(await moveDealStage(manager, id, "proposal", { expectedStage: "lead", reason: "Client signed early" })).toEqual({ status: "moved" });
    const log = await db.execute(sql`select new_value from audit_log where object_id = ${id} and action = 'stage'`);
    expect(log.rows[0].new_value).toEqual({ stage: "proposal", reason: "Client signed early" });
  });

  it("lets owners put their own deal on hold or close it as lost", async () => {
    const owner = await makeUser("sales");
    const id = await createRecord(owner, "deal", { name: "Parked" });
    expect(await moveDealStage(owner, id, "on_hold", { expectedStage: "lead", reason: "Client paused" })).toEqual({ status: "moved" });
  });

  it("reports a conflict if the stage changed since the person looked", async () => {
    const manager = await makeUser("manager");
    const id = await createRecord(manager, "deal", { name: "Stale" });
    await moveDealStage(manager, id, "proposal", { expectedStage: "lead", reason: "r" });
    expect(await moveDealStage(manager, id, "closed_won", { expectedStage: "lead", reason: "r" })).toEqual({ status: "conflict", currentStage: "proposal" });
  });
});

describe("deleting", () => {
  it("lets only admins delete, and restores within 30 days", async () => {
    const admin = await makeUser("admin");
    const sales = await makeUser("sales");
    const id = await createRecord(sales, "company", { name: "Gone Ltd" });
    await expect(deleteRecord(sales, "company", id)).rejects.toThrow(PermissionError);
    await deleteRecord(admin, "company", id);
    await expect(updateRecord(sales, "company", id, { tradingName: "x" }, {})).rejects.toThrow(/deleted/);
    await restoreRecord(admin, "company", id);
    expect((await row("companies", id)).deleted_at).toBeNull();
  });

  it("does not restore records deleted more than 30 days ago", async () => {
    const admin = await makeUser("admin");
    const id = await createRecord(admin, "company", { name: "Old Ltd" });
    await db.execute(sql`update companies set deleted_at = now() - interval '31 days' where id = ${id}`);
    await expect(restoreRecord(admin, "company", id)).rejects.toThrow(/30 days/);
  });
});
