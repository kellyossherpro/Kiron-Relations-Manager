import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { makeUser, resetDb } from "@/test/helpers";
import { createFieldDefinition, updateFieldDefinition } from "./admin";
import { PermissionError, RuleError } from "./errors";
import { applyKironPipeline, KIRON_FIELDS, kironPipelineSummary } from "./kiron-pipeline";
import { addCollaborator, addDealContact } from "./links";
import type { Actor } from "./permissions";
import { createRecord, updateRecord } from "./records";
import { evaluateDeal } from "./stage-engine";

beforeEach(async () => {
  await resetDb();
  await db.execute(sql`delete from stage_requirements; delete from stage_transitions`);
  await db.execute(sql`
    insert into stage_transitions (from_stage, to_stage, position) values
      ('lead','customer_engagement',1), ('customer_engagement','qualified_lead',1), ('qualified_lead','proposal',1),
      ('feasibility','proposal',1), ('proposal','legal_compliance',1), ('legal_compliance','closed_won',1), ('closed_won','live_direct',1)`);
});
afterAll(() => pool.end());

const stageOf = async (id: string) => (await db.execute(sql`select stage_key from deals where id = ${id}`)).rows[0].stage_key as string;
const missing = async (id: string) => (await evaluateDeal(id))!.requirements.filter((r) => !r.met).map((r) => r.label);

// Saves fields that are still empty on the deal (the "before" value is empty).
async function fill(actor: Actor, id: string, values: Record<string, unknown>) {
  const res = await updateRecord(actor, "deal", id, values, Object.fromEntries(Object.keys(values).map((k) => [k, null])));
  expect(res.status).toBe("saved");
}

const QUALIFIED_VANILLA = {
  "p.distribution_channel": "Retail",
  "p.b2b_or_b2c": "B2C",
  "p.setup_fee_usd": "0",
  "p.monthly_minimum_amount_usd": "1000",
  "p.billing_currency": "USD",
  "p.integration_type": "A Generic (Vanilla) integration",
  "p.product_event_type": ["Horses", "Greyhound"],
  "p.distribution_platform": "BetMan Retail",
  "p.picture_solution": "Streaming",
  "p.dedicated_server": false,
  "p.regulated_market": "yes",
  "p.market_we_will_operate_in": ["South Africa"],
  "p.gambling_license_applicable": "N/A",
  "p.tax_applicable": ["None"],
  "p.number_of_shops_websites_to_go_live_with": 12,
  "p.termination_period": "Standard Term (60 days)",
  "p.term_of_agreement": "Standard Term (2 years)",
  "p.fee_rate_type": "Flat Rate",
  "p.flat_rate": 12,
  "p.based_on_ggr_ngr": "GGR",
};

async function setUp() {
  const admin = await makeUser("admin");
  const sales = await makeUser("sales");
  const am = await makeUser("account_manager");
  const legal = await makeUser("legal");
  await applyKironPipeline(admin);
  const company = await createRecord(sales, "company", { name: "Example Operator Ltd" });
  const person = await createRecord(sales, "contact", { firstName: "Ola", lastName: "Example", email: "ola@example.test" });
  const deal = await createRecord(sales, "deal", { name: "Example Operator – BetMan Retail" });
  return { admin, sales, am, legal, company, person, deal };
}

// Lead → Customer Engagement → Qualified Lead, the same for every route.
async function toQualifiedLead(s: Awaited<ReturnType<typeof setUp>>) {
  expect(await missing(s.deal)).toEqual(["Country where operator is based", "Lead source", "Anticipated monthly amount (USD)"]);
  await fill(s.sales, s.deal, { "p.country_where_operator_is_based": "South Africa", "p.lead_source": "LinkedIn", amountMonthly: "8000" });
  expect(await stageOf(s.deal)).toBe("customer_engagement");

  await fill(s.sales, s.deal, { primaryCompanyId: s.company, "p.legal_entity_address": "1 Example Road", "p.kiron_contracting_entity": "South Africa" });
  expect(await missing(s.deal)).toEqual(["A contact added"]);
  await addDealContact(s.sales, s.deal, s.person, "primary");
  expect(await stageOf(s.deal)).toBe("qualified_lead");
}

describe("setting up the playbook", () => {
  it("adds every field and rule once, and only an admin can", async () => {
    const admin = await makeUser("admin");
    await expect(applyKironPipeline(await makeUser("manager"))).rejects.toThrow(PermissionError);
    const summary = await applyKironPipeline(admin);
    expect(summary).toEqual(kironPipelineSummary());
    const n = await db.execute(sql`select count(*)::int as n from property_definitions where object_type = 'deal'`);
    expect(n.rows[0].n).toBe(KIRON_FIELDS.length);
    await expect(applyKironPipeline(admin)).rejects.toThrow(/already set up/);
  });

  it("reuses a matching field an admin already made, and stops on a clash", async () => {
    const admin = await makeUser("admin");
    await createFieldDefinition(admin, { objectType: "deal", label: "Live date", type: "text" });
    await expect(applyKironPipeline(admin)).rejects.toThrow(/different type/);
    await db.execute(sql`delete from property_definitions`);
    await createFieldDefinition(admin, { objectType: "deal", label: "Live date", type: "date" });
    await applyKironPipeline(admin);
    const n = await db.execute(sql`select count(*)::int as n from property_definitions where key = 'live_date'`);
    expect(n.rows[0].n).toBe(1);
  });
});

describe("fields that only apply for some answers", () => {
  it("the playbook sets them, and bad settings are explained", async () => {
    const admin = await makeUser("admin");
    await applyKironPipeline(admin);
    const row = (await db.execute(sql`select id, show_when from property_definitions where key = 'server_name'`)).rows[0];
    expect(row.show_when).toEqual({ field: "p.dedicated_server", values: ["Yes"] });

    const id = row.id as string;
    await expect(updateFieldDefinition(admin, id, { showWhen: { field: "p.server_name", values: ["Yes"] } })).rejects.toThrow(/itself/);
    await expect(updateFieldDefinition(admin, id, { showWhen: { field: "p.legal_entity_address", values: ["x"] } })).rejects.toThrow(/dropdown or yes\/no/);
    await expect(updateFieldDefinition(admin, id, { showWhen: { field: "p.dedicated_server", values: ["Maybe"] } })).rejects.toThrow(/options/);
    await updateFieldDefinition(admin, id, { showWhen: null });
    expect((await db.execute(sql`select show_when from property_definitions where id = ${id}`)).rows[0].show_when).toBeNull();
  });
});

describe("a deal through Kiron's pipeline", () => {
  it("direct route: Lead to Live Direct, with Legal and Compliance doing their part", async () => {
    const s = await setUp();
    await toQualifiedLead(s);

    await fill(s.sales, s.deal, { ...QUALIFIED_VANILLA, "p.technical_review_performed": false });
    expect(await missing(s.deal)).toEqual(["Technical review performed is Yes"]); // "No" holds it back
    await updateRecord(s.sales, "deal", s.deal, { "p.technical_review_performed": true }, { "p.technical_review_performed": false });
    expect(await stageOf(s.deal)).toBe("proposal"); // vanilla skips Feasibility

    await fill(s.sales, s.deal, { "p.proposal_sent_to_client": true, "p.proposal_accepted_by_client": "Yes", "p.via_aggregator": false });
    expect(await missing(s.deal)).toEqual(["Proposal (link) (when Proposal accepted by client is Yes)", "A collaborator added (when Via aggregator is No)"]);
    await fill(s.sales, s.deal, { "p.proposal_link": "portal.example.test/proposal/1" });
    await addCollaborator(s.sales, s.deal, s.am.id);
    expect(await stageOf(s.deal)).toBe("legal_compliance");

    // Legal fills its two fields; it can't touch Sales' one.
    await fill(s.legal, s.deal, { "p.agreement_drafted_and_sent": true, "p.cdd_kyc_complete": true });
    await expect(fill(s.legal, s.deal, { "p.agreement_signed_internally": true })).rejects.toThrow(PermissionError);
    await fill(s.sales, s.deal, { "p.agreement_signed_internally": true });
    expect(await stageOf(s.deal)).toBe("closed_won");

    await fill(s.am, s.deal, {
      "p.contract_counter_signed_date": "2026-11-02",
      "p.teams_group_link": "teams.example.test/g/1",
      "p.included_in_budget": true,
      "p.anticipated_go_live_date": "2026-12-01",
    });
    expect(await missing(s.deal)).toEqual(["Finance contact added", "Marketing contact added", "Support contact added", "Live date"]);
    for (const role of ["finance", "marketing", "support"]) await addDealContact(s.am, s.deal, s.person, role);
    await fill(s.am, s.deal, { "p.live_date": "2026-12-03" });
    expect(await stageOf(s.deal)).toBe("live_direct");
  });

  it("aggregator route: skips Legal & Compliance and ends in Live via Aggregator", async () => {
    const s = await setUp();
    const aggregator = await createRecord(s.sales, "company", { name: "Example Aggregator Ltd" });
    await toQualifiedLead(s);
    await fill(s.sales, s.deal, { ...QUALIFIED_VANILLA, "p.technical_review_performed": true });

    await fill(s.sales, s.deal, { "p.proposal_sent_to_client": false, "p.proposal_accepted_by_client": "No proposal needed", "p.via_aggregator": true });
    expect(await missing(s.deal)).toEqual(["Aggregator (when Via aggregator is Yes)"]); // no collaborator needed
    await fill(s.sales, s.deal, { viaAggregatorId: aggregator });
    expect(await stageOf(s.deal)).toBe("closed_won");

    for (const role of ["finance", "marketing", "support"]) await addDealContact(s.sales, s.deal, s.person, role);
    await fill(s.sales, s.deal, {
      "p.teams_group_link": "teams.example.test/g/2",
      "p.included_in_budget": false,
      "p.anticipated_go_live_date": "2026-12-01",
      "p.live_date": "2026-12-02",
    }); // no counter-signed date: there's no Kiron contract
    expect(await stageOf(s.deal)).toBe("live_aggregator");
  });

  it("custom route: Feasibility (RICE) until the RICE board approves", async () => {
    const s = await setUp();
    await toQualifiedLead(s);
    await fill(s.sales, s.deal, { ...QUALIFIED_VANILLA, "p.integration_type": "A Bespoke (Custom) Integration", "p.technical_review_performed": true });
    expect(await stageOf(s.deal)).toBe("feasibility");
    await fill(s.sales, s.deal, { "p.rice_analysis_needed": true, "p.rice_full_report_link": "portal.example.test/rice/1", "p.rice_board_decision": "Rejected" });
    expect(await missing(s.deal)).toEqual(["RICE board decision is Approved"]);
    await updateRecord(s.admin, "deal", s.deal, { "p.rice_board_decision": "Approved" }, { "p.rice_board_decision": "Rejected" });
    expect(await stageOf(s.deal)).toBe("proposal");
  });

  it("asks for the extra details only when they apply", async () => {
    const s = await setUp();
    await toQualifiedLead(s);
    await fill(s.sales, s.deal, {
      ...QUALIFIED_VANILLA,
      "p.technical_review_performed": true,
      "p.fee_rate_type": "Variable Rate",
      "p.flat_rate": null,
      "p.dedicated_server": true,
      "p.distribution_platform": "3rd Party",
      "p.termination_period": "Custom Period",
    });
    expect(await missing(s.deal)).toEqual([
      "3rd party name (when Distribution platform is 3rd Party)",
      "Server name (when Dedicated server is Yes)",
      "Server cost to client (USD) (when Dedicated server is Yes)",
      "Custom termination period (days) (when Termination period is Custom Period)",
      "Variable rate tier 1 from (USD) (when Fee/rate type is Variable Rate)",
      "Variable rate tier 1 to (USD) (when Fee/rate type is Variable Rate)",
      "Variable rate tier 1 rate % (when Fee/rate type is Variable Rate)",
    ]);
  });

  it("explains bad 'must be' answers", async () => {
    const s = await setUp();
    await db.execute(sql`delete from stage_requirements`);
    const { addRequirement } = await import("./stage-rules-admin");
    await expect(addRequirement(s.admin, { stageKey: "lead", kind: "field", fieldKey: "p.lead_source", requiredValues: ["Carrier pigeon"] })).rejects.toThrow(RuleError);
  });
});
