import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { makeUser, resetDb } from "@/test/helpers";
import { createFieldDefinition } from "./admin";
import { PermissionError, RuleError } from "./errors";
import { addCollaborator, addDealContact } from "./links";
import { createRecord, updateRecord } from "./records";
import { evaluate, evaluateDeal, runDailyRules, type PipelineConfig } from "./stage-engine";
import { addRequirement, addTransition, listNotifications, markAllRead, unreadCount } from "./stage-rules-admin";

beforeEach(async () => {
  await resetDb();
  await db.execute(sql`delete from notifications; delete from stage_requirements`);
  // Restore the default "where next" routes in case a test changed them.
  await db.execute(sql`delete from stage_transitions`);
  await db.execute(sql`
    insert into stage_transitions (from_stage, to_stage, position) values
      ('lead','customer_engagement',1), ('customer_engagement','qualified_lead',1), ('qualified_lead','proposal',1),
      ('feasibility','proposal',1), ('proposal','legal_compliance',1), ('legal_compliance','closed_won',1), ('closed_won','live_direct',1)`);
});
afterAll(() => pool.end());

async function stageOf(id: string) {
  return (await db.execute(sql`select stage_key from deals where id = ${id}`)).rows[0].stage_key as string;
}

describe("evaluate (pure rules)", () => {
  const cfg: PipelineConfig = {
    stages: [
      { key: "a", label: "A", kind: "open", position: 1 },
      { key: "b", label: "B", kind: "open", position: 2 },
      { key: "c", label: "C", kind: "open", position: 3 },
    ],
    requirements: [
      { id: "r1", stageKey: "a", kind: "field", fieldKey: "p.type", contactRole: null, whenField: null, whenValue: null, position: 1 },
      { id: "r2", stageKey: "a", kind: "field", fieldKey: "p.rice", contactRole: null, whenField: "p.type", whenValue: "Custom", position: 2 },
    ],
    transitions: [
      { id: "t1", fromStage: "a", toStage: "c", whenField: "p.type", whenValue: "Custom", position: 0 },
      { id: "t2", fromStage: "a", toStage: "b", whenField: null, whenValue: null, position: 1 },
    ],
    fields: [
      { key: "p.type", label: "Integration type", type: "select", options: ["Custom", "Vanilla"] },
      { key: "p.rice", label: "RICE report", type: "text" },
    ],
  };
  const deal = (values: Record<string, unknown>) => ({ stageKey: "a", values, contactRoles: [], hasPrimaryCompany: false, collaboratorCount: 0 });

  it("only asks for conditional fields when the condition holds", () => {
    expect(evaluate(deal({ "p.type": "Vanilla" }), cfg)).toMatchObject({ complete: true, next: { key: "b" } });
    const custom = evaluate(deal({ "p.type": "Custom" }), cfg);
    expect(custom.complete).toBe(false);
    expect(custom.requirements.map((r) => [r.label, r.met])).toEqual([
      ["Integration type", true],
      ["RICE report (when Integration type is Custom)", false],
    ]);
    expect(evaluate(deal({ "p.type": "Custom", "p.rice": "done" }), cfg).next?.key).toBe("c");
  });

  it("never counts a stage with no requirements as complete", () => {
    expect(evaluate({ ...deal({}), stageKey: "b" }, cfg).complete).toBe(false);
  });

  it("treats No as an answer for yes/no fields", () => {
    const yn: PipelineConfig = { ...cfg, requirements: [{ ...cfg.requirements[0], fieldKey: "p.ok" }], fields: [{ key: "p.ok", label: "OK", type: "yesno" }] };
    expect(evaluate(deal({ "p.ok": false }), yn).complete).toBe(true);
  });
});

describe("deals move on their own", () => {
  it("moves a deal to the next stage when the last required field is saved", async () => {
    const admin = await makeUser("admin");
    const sales = await makeUser("sales");
    await createFieldDefinition(admin, { objectType: "deal", label: "Lead source", type: "text" });
    await addRequirement(admin, { stageKey: "lead", kind: "field", fieldKey: "p.lead_source" });
    await addRequirement(admin, { stageKey: "lead", kind: "field", fieldKey: "amountMonthly" });

    const id = await createRecord(sales, "deal", { name: "Mover" });
    const first = await updateRecord(sales, "deal", id, { amountMonthly: "1000" }, { amountMonthly: null });
    expect(first).toMatchObject({ status: "saved", movedTo: [] });
    expect(await stageOf(id)).toBe("lead");

    const second = await updateRecord(sales, "deal", id, { "p.lead_source": "Event" }, { "p.lead_source": null });
    expect(second).toMatchObject({ status: "saved", movedTo: ["customer_engagement"] });
    expect(await stageOf(id)).toBe("customer_engagement");

    const log = await db.execute(sql`select user_id, new_value from audit_log where object_id = ${id} and action = 'stage'`);
    expect(log.rows[0].user_id).toBeNull(); // done by the system, not a person
    expect(log.rows[0].new_value).toMatchObject({ stage: "customer_engagement", automatic: true });
    expect(await unreadCount(sales.id)).toBe(1);
  });

  it("follows a branch: custom integrations go to Feasibility, others skip it", async () => {
    const admin = await makeUser("admin");
    await createFieldDefinition(admin, { objectType: "deal", label: "Integration type", type: "select", options: ["Vanilla", "Custom"] });
    await addRequirement(admin, { stageKey: "qualified_lead", kind: "field", fieldKey: "p.integration_type" });
    await addTransition(admin, { fromStage: "qualified_lead", toStage: "feasibility", whenField: "p.integration_type", whenValue: "Custom" });

    const custom = await createRecord(admin, "deal", { name: "Custom one" });
    const vanilla = await createRecord(admin, "deal", { name: "Vanilla one" });
    await db.execute(sql`update deals set stage_key = 'qualified_lead' where id in (${custom}, ${vanilla})`);

    await updateRecord(admin, "deal", custom, { "p.integration_type": "Custom" }, { "p.integration_type": null });
    await updateRecord(admin, "deal", vanilla, { "p.integration_type": "Vanilla" }, { "p.integration_type": null });
    expect(await stageOf(custom)).toBe("feasibility");
    expect(await stageOf(vanilla)).toBe("proposal");
  });

  it("counts contacts with roles and collaborators as requirements", async () => {
    const admin = await makeUser("admin");
    const owner = await makeUser("sales");
    const helper = await makeUser("account_manager");
    await addRequirement(admin, { stageKey: "lead", kind: "has_contact", contactRole: "finance" });
    await addRequirement(admin, { stageKey: "lead", kind: "has_collaborator" });
    const id = await createRecord(owner, "deal", { name: "People" });
    const p = await createRecord(owner, "contact", { firstName: "Fin", email: "fin@example.test" });

    await addDealContact(owner, id, p, "support");
    expect(await stageOf(id)).toBe("lead"); // wrong role
    await addDealContact(owner, id, p, "finance");
    expect(await stageOf(id)).toBe("lead"); // still needs a collaborator
    await addCollaborator(owner, id, helper.id);
    expect(await stageOf(id)).toBe("customer_engagement");
  });

  it("keeps going through several stages if they're all already complete", async () => {
    const admin = await makeUser("admin");
    await addRequirement(admin, { stageKey: "lead", kind: "field", fieldKey: "amountMonthly" });
    await addRequirement(admin, { stageKey: "customer_engagement", kind: "has_primary_company" });
    const co = await createRecord(admin, "company", { name: "Cascade Ltd" });
    const id = await createRecord(admin, "deal", { name: "Cascade", primaryCompanyId: co });
    const res = await updateRecord(admin, "deal", id, { amountMonthly: "5" }, { amountMonthly: null });
    expect(res).toMatchObject({ movedTo: ["customer_engagement", "qualified_lead"] });
  });

  it("moves exactly once when two people complete the last two fields at the same time", async () => {
    const admin = await makeUser("admin");
    const other = await makeUser("manager");
    await createFieldDefinition(admin, { objectType: "deal", label: "Source", type: "text" });
    await addRequirement(admin, { stageKey: "lead", kind: "field", fieldKey: "p.source" });
    await addRequirement(admin, { stageKey: "lead", kind: "field", fieldKey: "amountMonthly" });
    const id = await createRecord(admin, "deal", { name: "Race" });

    await Promise.all([
      updateRecord(admin, "deal", id, { "p.source": "Web" }, { "p.source": null }),
      updateRecord(other, "deal", id, { amountMonthly: "10" }, { amountMonthly: null }),
    ]);
    expect(await stageOf(id)).toBe("customer_engagement");
    const moves = await db.execute(sql`select count(*)::int as n from audit_log where object_id = ${id} and action = 'stage'`);
    expect(moves.rows[0].n).toBe(1);
  });

  it("shows what's missing on a deal", async () => {
    const admin = await makeUser("admin");
    await addRequirement(admin, { stageKey: "lead", kind: "field", fieldKey: "amountMonthly" });
    await addRequirement(admin, { stageKey: "lead", kind: "has_primary_company" });
    const id = await createRecord(admin, "deal", { name: "Missing" });
    const ev = await evaluateDeal(id);
    expect(ev?.requirements.filter((r) => !r.met).map((r) => r.label)).toEqual(["Anticipated monthly amount (USD)", "Contracting company set"]);
    expect(ev?.next?.label).toBe("Customer Engagement");
  });
});

describe("rule settings", () => {
  it("only admins can change them, and bad settings are explained", async () => {
    const admin = await makeUser("admin");
    const manager = await makeUser("manager");
    await expect(addRequirement(manager, { stageKey: "lead", kind: "has_primary_company" })).rejects.toThrow(PermissionError);
    await expect(addRequirement(admin, { stageKey: "lead", kind: "field", fieldKey: "p.nope" })).rejects.toThrow(RuleError);
    await expect(addTransition(admin, { fromStage: "lead", toStage: "lead" })).rejects.toThrow(/already in/);
    await addRequirement(admin, { stageKey: "lead", kind: "has_primary_company" });
    await expect(addRequirement(admin, { stageKey: "lead", kind: "has_primary_company" })).rejects.toThrow(/already/);
  });
});

describe("daily rules", () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

  it("reminds the owner once after 30 days, moves to On Hold after 60, and to Closed Lost after 60 on hold", async () => {
    const sales = await makeUser("sales");
    const fresh = await createRecord(sales, "deal", { name: "Fresh" });
    const stale = await createRecord(sales, "deal", { name: "Stale" });
    const old = await createRecord(sales, "deal", { name: "Old" });
    const parked = await createRecord(sales, "deal", { name: "Parked" });
    const live = await createRecord(sales, "deal", { name: "Live" });
    await db.execute(sql`update deals set stage_entered_at = ${daysAgo(31)} where id = ${stale}`);
    await db.execute(sql`update deals set stage_entered_at = ${daysAgo(61)} where id = ${old}`);
    await db.execute(sql`update deals set stage_key = 'on_hold', stage_entered_at = ${daysAgo(61)} where id = ${parked}`);
    await db.execute(sql`update deals set stage_key = 'live_direct', stage_entered_at = ${daysAgo(400)} where id = ${live}`);

    expect(await runDailyRules()).toEqual({ reminded: 1, putOnHold: 1, closedLost: 1 });
    expect(await stageOf(fresh)).toBe("lead");
    expect(await stageOf(stale)).toBe("lead");
    expect(await stageOf(old)).toBe("on_hold");
    expect(await stageOf(parked)).toBe("closed_lost");
    expect(await stageOf(live)).toBe("live_direct");

    // Running again the same day changes nothing and doesn't repeat the reminder.
    expect(await runDailyRules()).toEqual({ reminded: 0, putOnHold: 0, closedLost: 0 });
    const notes = await listNotifications(sales.id);
    expect(notes.map((n) => n.kind).sort()).toEqual(["closed_lost_auto", "on_hold_auto", "stage_stale"]);
    await markAllRead(sales.id);
    expect(await unreadCount(sales.id)).toBe(0);
  });
});
