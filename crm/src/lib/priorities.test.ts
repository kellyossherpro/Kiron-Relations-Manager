import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { makeUser, resetDb } from "@/test/helpers";
import { PermissionError } from "./errors";
import { listPriorities, movePriority, setPriority, takenPriorities } from "./priorities";
import { createRecord } from "./records";

beforeEach(resetDb);
afterAll(() => pool.end());

describe("deal priorities", () => {
  it("each number belongs to one deal; only managers and admins set them", async () => {
    const admin = await makeUser("admin");
    const sales = await makeUser("sales");
    const a = await createRecord(sales, "deal", { name: "Deal A" });
    const b = await createRecord(sales, "deal", { name: "Deal B" });
    await expect(setPriority(sales, a, 1)).rejects.toThrow(PermissionError);
    await setPriority(admin, a, 5);
    await expect(setPriority(admin, b, 5)).rejects.toThrow('Priority 5 is already "Deal A"');
    await expect(setPriority(admin, b, 0)).rejects.toThrow("from 1 to");
    await setPriority(admin, b, 2);
    expect(await takenPriorities()).toEqual({ 2: { id: b, name: "Deal B" }, 5: { id: a, name: "Deal A" } });
    expect((await listPriorities()).map((p) => [p.priority, p.name])).toEqual([[2, "Deal B"], [5, "Deal A"]]);
    // Taking it away frees the number.
    await setPriority(admin, a, null);
    await setPriority(admin, b, 5);
    expect((await listPriorities()).map((p) => [p.priority, p.name])).toEqual([[5, "Deal B"]]);
  });

  it("moving up and down swaps numbers with the neighbour, gaps and all", async () => {
    const manager = await makeUser("manager");
    const ids = [];
    for (const [name, n] of [["First", 1], ["Second", 3], ["Third", 7]] as const) {
      const id = await createRecord(manager, "deal", { name });
      await setPriority(manager, id, n);
      ids.push(id);
    }
    await movePriority(manager, ids[2], "up");
    expect((await listPriorities()).map((p) => `${p.priority} ${p.name}`)).toEqual(["1 First", "3 Third", "7 Second"]);
    await movePriority(manager, ids[0], "up"); // already first: nothing changes
    await movePriority(manager, ids[0], "down");
    expect((await listPriorities()).map((p) => `${p.priority} ${p.name}`)).toEqual(["1 Third", "3 First", "7 Second"]);
    const history = await db.execute(sql`select count(*)::int as n from audit_log where field = 'priority'`);
    expect(history.rows[0].n).toBe(7); // 3 set + 2 per real move
  });
});
