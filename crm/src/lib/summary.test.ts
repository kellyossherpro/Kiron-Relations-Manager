import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/db";
import { makeUser, resetDb } from "@/test/helpers";
import { createRecord, moveDealStage } from "./records";
import { dealSummary } from "./summary";

beforeEach(resetDb);
afterAll(() => pool.end());

describe("summary of deal values", () => {
  it("adds up each stage and the groups; closed deals stay out of the active total", async () => {
    const manager = await makeUser("manager");
    const deal = (name: string, amount?: string) => createRecord(manager, "deal", { name, ...(amount ? { amountMonthly: amount } : {}) });
    await deal("Lead one", "1000");
    await deal("Lead two"); // no amount yet
    const won = await deal("Won deal", "5000");
    const live = await deal("Live deal", "20000");
    const lost = await deal("Lost deal", "9000");
    await moveDealStage(manager, won, "closed_won", { expectedStage: "lead", reason: "Signed" });
    await moveDealStage(manager, live, "live_direct", { expectedStage: "lead", reason: "Went live" });
    await moveDealStage(manager, lost, "closed_lost", { expectedStage: "lead", reason: "Chose someone else" });

    const s = await dealSummary();
    expect(s.stages.find((x) => x.key === "lead")).toMatchObject({ count: 2, monthly: 1000 });
    expect(s.totals).toEqual({
      active: { count: 4, monthly: 26000 },
      selling: { count: 2, monthly: 1000 },
      nextUp: { count: 1, monthly: 5000 },
      live: { count: 1, monthly: 20000 },
      onHold: { count: 0, monthly: 0 },
      closed: { count: 1, monthly: 9000 },
    });
    expect(s.deals.map((d) => d.name)).toEqual(["Live deal", "Lost deal", "Won deal", "Lead one", "Lead two"]); // biggest first
  });
});
