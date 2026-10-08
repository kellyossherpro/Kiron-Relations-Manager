import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { joinTeam, makeUser, resetDb } from "@/test/helpers";
import { createFieldDefinition } from "./admin";
import { PermissionError, RuleError } from "./errors";
import { confirmGoLive, goLiveDeals, goLiveTeams, goLiveWaiting, setGoLiveTeams, undoGoLive } from "./go-live";
import { platformOf } from "./go-live-checks";
import { moveDealStage, createRecord } from "./records";
import { addRequirement, listNotifications } from "./stage-rules-admin";

beforeEach(resetDb);
afterAll(() => pool.end());

const stageOf = async (id: string) => (await db.execute(sql`select stage_key from deals where id = ${id}`)).rows[0].stage_key as string;

async function setUp(platform: string | null) {
  const admin = await makeUser("admin");
  const sales = await makeUser("sales");
  const people = {
    legal: await joinTeam(await makeUser("legal"), "Risk, Legal, & Compliance"),
    finance: await joinTeam(await makeUser("viewer"), "Finance"),
    support: await joinTeam(await makeUser("viewer"), "Support & Installations"),
    betman: await joinTeam(await makeUser("viewer"), "Development (Betman)"),
    vse: await joinTeam(await makeUser("viewer"), "Development (VSE)"),
  };
  await createFieldDefinition(admin, { objectType: "deal", label: "Distribution platform", type: "select", options: ["BetMan Retail", "VSE Only", "Mobile Lite"] });
  await addRequirement(admin, { stageKey: "closed_won", kind: "go_live_confirmed" });
  const deal = await createRecord(sales, "deal", { name: "Example deal", ...(platform ? { "p.distribution_platform": platform } : {}) });
  return { admin, sales, people, deal };
}
const toWon = (admin: Awaited<ReturnType<typeof makeUser>>, deal: string) => moveDealStage(admin, deal, "closed_won", { expectedStage: "lead", reason: "Signed" });

describe("who confirms", () => {
  it("reads the platform", () => {
    expect([platformOf("BetMan Online"), platformOf("VSE Only"), platformOf("Mobile Lite"), platformOf(null)]).toEqual(["betman", "vse", null, null]);
  });

  it("VSE deals: only the VSE dev team (or an admin) confirms Dev", async () => {
    const s = await setUp("VSE Only");
    await expect(confirmGoLive(s.people.finance, s.deal, "finance")).rejects.toThrow("once the deal is Closed Won");
    await toWon(s.admin, s.deal);
    // Asked straight away: nothing else is required at Closed Won in this setup.
    expect((await listNotifications(s.people.vse.id)).map((n) => n.kind)).toEqual(["golive_needed"]);
    expect(await listNotifications(s.people.betman.id)).toEqual([]);
    expect(await goLiveWaiting(s.people.vse.teamIds!)).toMatchObject([{ dealId: s.deal, key: "dev" }]);
    await expect(confirmGoLive(s.people.betman, s.deal, "dev")).rejects.toThrow(PermissionError);
    await expect(confirmGoLive(s.people.vse, s.deal, "legal")).rejects.toThrow("Only Risk, Legal, & Compliance");
    await confirmGoLive(s.people.vse, s.deal, "dev");
    await confirmGoLive(s.admin, s.deal, "legal"); // admins can step in
    await confirmGoLive(s.people.finance, s.deal, "finance");
    expect(await goLiveWaiting(s.people.vse.teamIds!)).toEqual([]);
    // The owner hears about each one.
    expect((await listNotifications(s.sales.id)).filter((n) => n.kind === "golive_confirmed")).toHaveLength(3);
    const { movedTo } = await confirmGoLive(s.people.support, s.deal, "support");
    expect(movedTo).toEqual(["live_direct"]);
    // Once live, the handovers can't be undone.
    await expect(undoGoLive(s.people.support, s.deal, "support")).rejects.toThrow(RuleError);
  });

  it("platform not known yet: either dev team can confirm; mistakes can be undone before going live", async () => {
    const s = await setUp("Mobile Lite");
    await toWon(s.admin, s.deal);
    expect((await listNotifications(s.people.betman.id)).length + (await listNotifications(s.people.vse.id)).length).toBe(2);
    await confirmGoLive(s.people.betman, s.deal, "dev");
    await confirmGoLive(s.people.betman, s.deal, "dev"); // twice is harmless
    await expect(undoGoLive(s.people.finance, s.deal, "dev")).rejects.toThrow(PermissionError);
    await undoGoLive(s.people.vse, s.deal, "dev");
    const [d] = await goLiveDeals();
    expect(d.checks.map((c) => [c.label, c.teamNames, !!c.confirmed])).toEqual([
      ["Legal", "Risk, Legal, & Compliance", false],
      ["Finance", "Finance", false],
      ["Support", "Support & Installations", false],
      ["Dev", "Development (Betman) or Development (VSE)", false],
    ]);
    expect(await stageOf(s.deal)).toBe("closed_won");
  });

  it("an admin can choose other departments", async () => {
    const s = await setUp("BetMan Retail");
    await expect(setGoLiveTeams(s.sales, { finance: null })).rejects.toThrow(PermissionError);
    const billing = await joinTeam(await makeUser("viewer"), "Billing");
    await setGoLiveTeams(s.admin, { finance: billing.teamIds![0] });
    expect((await goLiveTeams(db)).finance).toBe(billing.teamIds![0]);
    await toWon(s.admin, s.deal);
    await expect(confirmGoLive(s.people.finance, s.deal, "finance")).rejects.toThrow(PermissionError);
    await confirmGoLive(billing, s.deal, "finance");
    expect((await goLiveDeals())[0]).toMatchObject({ platform: "BetMan Retail", stageKind: "won" });
  });
});
