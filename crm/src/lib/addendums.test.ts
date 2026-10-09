import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { makeUser, resetDb } from "@/test/helpers";
import { addendumBoard, cancelAddendum, dealAddendums, finishAddendum, openAddendumCount, raiseAddendum } from "./addendums";
import { PermissionError, RuleError } from "./errors";
import { addCollaborator } from "./links";
import { createRecord, moveDealStage } from "./records";
import { addRequirement, addTransition, listNotifications } from "./stage-rules-admin";

beforeEach(async () => {
  await resetDb();
  await db.execute(sql`delete from stage_requirements`);
});
afterAll(() => pool.end());

async function stageOf(id: string) {
  return (await db.execute(sql`select stage_key from deals where id = ${id}`)).rows[0].stage_key as string;
}

async function liveDeal(owner: Parameters<typeof createRecord>[0], stage = "live_direct", name = "Live client") {
  const id = await createRecord(owner, "deal", { name });
  await db.execute(sql`update deals set stage_key = ${stage} where id = ${id}`);
  return id;
}

describe("the addendum loop", () => {
  it("raising moves the deal to Addendum; done sends it back to Live, ready for the next one", async () => {
    const owner = await makeUser("account_manager", "Ann Owner");
    const am = await makeUser("account_manager", "Ben Actioner");
    const id = await liveDeal(owner);

    const first = await raiseAddendum(owner, id, { type: "commercial", details: "Rev share 10% → 12% from next month" });
    expect(await stageOf(id)).toBe("addendum");
    expect(await openAddendumCount()).toBe(1);

    await finishAddendum(am, first, "Signed addendum filed");
    expect(await stageOf(id)).toBe("live_direct");
    expect(await openAddendumCount()).toBe(0);

    // A deal can go round as many times as the client needs.
    const second = await raiseAddendum(owner, id, { type: "new_product", details: "Add Horse Racing" });
    await finishAddendum(am, second);
    const all = await dealAddendums(id);
    expect(all.map((a) => [a.type, a.status, a.raisedByName, a.closedByName])).toEqual([
      ["new_product", "done", "Ann Owner", "Ben Actioner"],
      ["commercial", "done", "Ann Owner", "Ben Actioner"],
    ]);
    expect(all[1].closeNote).toBe("Signed addendum filed");

    const moves = await db.execute(sql`select new_value from audit_log where object_id = ${id} and action = 'stage' order by id`);
    expect(moves.rows.map((r) => (r.new_value as { stage: string; reason: string }).reason)).toEqual([
      "Addendum raised: Commercial / Pricing",
      "Addendum done: Commercial / Pricing. Signed addendum filed",
      "Addendum raised: New Product",
      "Addendum done: New Product",
    ]);
    // The owner hears when someone else finishes it; nobody is told about their own actions.
    expect((await listNotifications(owner.id)).map((n) => n.kind)).toEqual(["addendum_done", "addendum_done"]);
    expect(await listNotifications(am.id)).toEqual([]);
  });

  it("goes back to Live via Aggregator when that's where it came from", async () => {
    const owner = await makeUser("sales");
    const id = await liveDeal(owner, "live_aggregator");
    const a = await raiseAddendum(owner, id, { type: "market", details: "Add Kenya" });
    await finishAddendum(owner, a);
    expect(await stageOf(id)).toBe("live_aggregator");
  });

  it("cancelling needs a reason and also sends the deal back", async () => {
    const owner = await makeUser("sales");
    const id = await liveDeal(owner);
    const a = await raiseAddendum(owner, id, { type: "term", details: "Extend 12 months" });
    await expect(cancelAddendum(owner, a, " ")).rejects.toThrow(/why/);
    await cancelAddendum(owner, a, "Raised by mistake");
    expect(await stageOf(id)).toBe("live_direct");
    expect((await dealAddendums(id))[0]).toMatchObject({ status: "cancelled", closeNote: "Raised by mistake" });
  });

  it("only on live deals, one at a time, with a type and details", async () => {
    const owner = await makeUser("sales");
    const notLive = await createRecord(owner, "deal", { name: "Still a lead" });
    await expect(raiseAddendum(owner, notLive, { type: "commercial", details: "x" })).rejects.toThrow(/live deals/);

    const id = await liveDeal(owner);
    await expect(raiseAddendum(owner, id, { type: "nonsense", details: "x" })).rejects.toThrow(RuleError);
    await expect(raiseAddendum(owner, id, { type: "commercial", details: "  " })).rejects.toThrow(/exactly what's changing/);
    await raiseAddendum(owner, id, { type: "commercial", details: "New fee" });
    await expect(raiseAddendum(owner, id, { type: "platform", details: "IP list" })).rejects.toThrow(/already has an addendum/);
  });

  it("who can do what", async () => {
    const owner = await makeUser("sales");
    const otherSales = await makeUser("sales");
    const anyAm = await makeUser("account_manager");
    const legal = await makeUser("legal");
    const viewer = await makeUser("viewer");
    const collaborator = await makeUser("sales");
    const id = await liveDeal(owner);
    await addCollaborator(owner, id, collaborator.id);

    for (const who of [otherSales, legal, viewer]) {
      await expect(raiseAddendum(who, id, { type: "commercial", details: "x" })).rejects.toThrow(PermissionError);
    }
    // The AM team looks after live clients, so any account manager can raise one.
    await cancelAddendum(anyAm, await raiseAddendum(anyAm, id, { type: "commercial", details: "x" }), "testing");
    const a = await raiseAddendum(collaborator, id, { type: "commercial", details: "x" });
    for (const who of [otherSales, legal, viewer]) await expect(finishAddendum(who, a)).rejects.toThrow(PermissionError);
    await finishAddendum(anyAm, a); // the AM team actions addendums on anyone's deals
    expect(await stageOf(id)).toBe("live_direct");
  });

  it("if two people mark it done at the same time, it's done once", async () => {
    const owner = await makeUser("account_manager");
    const am = await makeUser("account_manager");
    const id = await liveDeal(owner);
    const a = await raiseAddendum(owner, id, { type: "legal_entity", details: "New entity name" });
    const results = await Promise.allSettled([finishAddendum(owner, a), finishAddendum(am, a)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason.message).toMatch(/already marked this addendum as done/);
    const back = await db.execute(sql`select count(*)::int as n from audit_log where object_id = ${id} and action = 'stage' and new_value->>'stage' = 'live_direct'`);
    expect(back.rows[0].n).toBe(1);
  });
});

describe("the Addendum stage is only used by the loop", () => {
  it("can't be chosen in Move deal, and moving out by hand cancels the addendum", async () => {
    const manager = await makeUser("manager");
    const id = await liveDeal(manager);
    await expect(moveDealStage(manager, id, "addendum", { expectedStage: "live_direct", reason: "change" })).rejects.toThrow(/Raise an addendum/);

    await raiseAddendum(manager, id, { type: "commercial", details: "New rate" });
    await moveDealStage(manager, id, "terminated", { expectedStage: "addendum", reason: "Client closed down" });
    expect(await dealAddendums(id)).toMatchObject([{ status: "cancelled", closeNote: "Deal moved to Terminated by hand: Client closed down" }]);
    expect(await openAddendumCount()).toBe(0);
  });

  it("stage rules can't send deals into or out of it", async () => {
    const admin = await makeUser("admin");
    await expect(addTransition(admin, { fromStage: "live_direct", toStage: "addendum" })).rejects.toThrow(/runs by itself/);
    await expect(addTransition(admin, { fromStage: "addendum", toStage: "live_direct" })).rejects.toThrow(/runs by itself/);
    await expect(addRequirement(admin, { stageKey: "addendum", kind: "has_primary_company" })).rejects.toThrow(/runs by itself/);
  });

  it("the board lists open ones oldest first and recent finished ones", async () => {
    const owner = await makeUser("account_manager");
    const one = await liveDeal(owner, "live_direct", "First");
    const two = await liveDeal(owner, "live_direct", "Second");
    const three = await liveDeal(owner, "live_direct", "Third");
    await raiseAddendum(owner, one, { type: "commercial", details: "a" });
    await raiseAddendum(owner, two, { type: "commercial", details: "b" });
    await finishAddendum(owner, await raiseAddendum(owner, three, { type: "commercial", details: "c" }));
    const board = await addendumBoard();
    expect(board.open.map((a) => a.dealName)).toEqual(["First", "Second"]);
    expect(board.recent.map((a) => a.dealName)).toEqual(["Third"]);
  });
});
