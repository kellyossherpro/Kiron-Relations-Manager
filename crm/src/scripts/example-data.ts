import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { raiseAddendum } from "@/lib/addendums";
import { createFirstAdmin, createUser } from "@/lib/admin";
import { logActivity } from "@/lib/activities";
import { applyKironPipeline } from "@/lib/kiron-pipeline";
import { addCollaborator, addDealContact, linkContactToCompany } from "@/lib/links";
import type { Actor } from "@/lib/permissions";
import { createRecord, updateRecord } from "@/lib/records";
import { runDailyRules } from "@/lib/stage-engine";

// Fills an EMPTY database with a made-up company's CRM, for demos and the tour:
//   npm run example:load    (refuses if there is any data)
//   npm run example:clear   (refuses unless every person in it is an @example.test address)
// Every name, email and figure here is invented. Never put real Kiron data in this file.

const DAY = 86_400_000;
const VANILLA = "A Generic (Vanilla) integration";
const CUSTOM = "A Bespoke (Custom) Integration";

async function isEmpty() {
  const r = await db.execute(sql`select (select count(*) from users) + (select count(*) from companies) + (select count(*) from deals) as n`);
  return Number(r.rows[0].n) === 0;
}

export async function clearExampleData() {
  const real = await db.execute(sql`select count(*)::int as n from users where email not like '%@example.test'`);
  if ((real.rows[0].n as number) > 0) throw new Error("This database has people who aren't example users. Not clearing it.");
  await db.execute(sql`truncate addendums, notifications, audit_log, activities, deal_collaborators, deal_contacts, deal_companies, company_contacts, deals, contacts, companies, property_definitions, users restart identity cascade`);
  await db.execute(sql`delete from stage_requirements`);
  await db.execute(sql`delete from stage_transitions`);
  await db.execute(sql`
    insert into stage_transitions (from_stage, to_stage, position) values
      ('lead','customer_engagement',1), ('customer_engagement','qualified_lead',1), ('qualified_lead','proposal',1),
      ('feasibility','proposal',1), ('proposal','legal_compliance',1), ('legal_compliance','closed_won',1), ('closed_won','live_direct',1)`);
}

async function user(admin: Actor, name: string, role: Actor["role"]): Promise<Actor> {
  const email = `${name.split(" ")[0].toLowerCase()}@example.test`;
  return { id: await createUser(admin, { name, email, role }), name, role };
}

async function setStage(dealId: string, stage: string, daysAgo: number) {
  await db.execute(sql`update deals set stage_key = ${stage}, stage_entered_at = ${new Date(Date.now() - daysAgo * DAY).toISOString()} where id = ${dealId}`);
}

export async function loadExampleData() {
  if (!(await isEmpty())) throw new Error("This database already has data. Example data only goes into an empty one.");

  // People
  const admin: Actor = { id: await createFirstAdmin("Admin Example", "admin@example.test"), name: "Admin Example", role: "admin" };
  const sam = await user(admin, "Sam Sales", "sales");
  const jo = await user(admin, "Jo Sales", "sales");
  const alex = await user(admin, "Alex Account-Manager", "account_manager");
  await user(admin, "Morgan Manager", "manager");
  await user(admin, "Lee Legal", "legal");

  // The sales playbook's fields and stage rules, as an admin would set them up in one click
  await applyKironPipeline(admin);

  // Companies
  const co: Record<string, string> = {};
  for (const [name, type, website] of [
    ["Bluebay Gaming Ltd", "online", "bluebay.example.test"],
    ["Copperline Retail Ltd", "retail", null],
    ["Harbour Lotteries Ltd", "both", "harbour.example.test"],
    ["Summit Play Ltd", "online", "summitplay.example.test"],
    ["Riverstone Entertainment Ltd", "retail", null],
    ["Northgate Bets Ltd", "online", "northgate.example.test"],
    ["Example Aggregator Ltd", "online", "aggregator.example.test"],
    ["Kestrel Sports Ltd", "both", "kestrel.example.test"],
  ] as const) {
    const address = name.startsWith("Bluebay") ? { "p.legal_entity_address": "1 Example Street, London" } : {};
    co[name] = await createRecord(sam, "company", { name, companyType: type, ...(website ? { website } : {}), ...address });
  }

  // Contacts
  const ct: Record<string, string> = {};
  for (const [first, last, company, job] of [
    ["Priya", "Example", "Bluebay Gaming Ltd", "Head of Product"],
    ["Tom", "Example", "Bluebay Gaming Ltd", "Finance Manager"],
    ["Maria", "Example", "Copperline Retail Ltd", "Operations Director"],
    ["Ben", "Example", "Harbour Lotteries Ltd", "CEO"],
    ["Aisha", "Example", "Summit Play Ltd", "Commercial Lead"],
    ["Luca", "Example", "Northgate Bets Ltd", "CTO"],
    ["Grace", "Example", "Kestrel Sports Ltd", "Marketing Manager"],
  ] as const) {
    const id = await createRecord(sam, "contact", { firstName: first, lastName: last, email: `${first.toLowerCase()}@${company.split(" ")[0].toLowerCase()}.example.test`, jobTitle: job });
    await linkContactToCompany(sam, co[company], id, job);
    ct[first] = id;
  }

  // Deals: created as Lead, then placed where they'd be in a real pipeline.
  // Every example operator is "based" somewhere; the Kestrel lead is still missing it.
  async function deal(owner: Actor, name: string, company: string, amount: string | null, extra: Record<string, unknown> = {}) {
    const country = company.startsWith("Kestrel") ? {} : { "p.country_where_operator_is_based": company.startsWith("Bluebay") ? "United Kingdom" : "South Africa" };
    return createRecord(owner, "deal", { name, primaryCompanyId: co[company], ...country, ...(amount ? { amountMonthly: amount } : {}), ...extra });
  }
  const bluebay = await deal(sam, "Bluebay – Online Casino Games", "Bluebay Gaming Ltd", null, {
    "p.kiron_contracting_entity": "Mauritius",
  });
  await addDealContact(sam, bluebay, ct.Priya, "primary");
  await addDealContact(sam, bluebay, ct.Tom, "finance");
  const copperline = await deal(sam, "Copperline – Retail Terminals", "Copperline Retail Ltd", null);
  await deal(jo, "Kestrel – Virtual Sports", "Kestrel Sports Ltd", "12000");

  const northgate = await deal(jo, "Northgate – Web & App", "Northgate Bets Ltd", "18000", { "p.lead_source": "Kiron Marketing" }); // moves to Customer Engagement
  await setStage(northgate, "customer_engagement", 9);
  const harbour = await deal(sam, "Harbour – Lottery Draw Games", "Harbour Lotteries Ltd", "9000", { "p.lead_source": "Independently sourced" });
  await addDealContact(sam, harbour, ct.Ben, "primary");
  await setStage(harbour, "qualified_lead", 34); // 30-day reminder
  const summit = await deal(sam, "Summit – Custom Racing Feed", "Summit Play Ltd", "45000", { "p.lead_source": "SBC Barcelona", "p.integration_type": CUSTOM });
  await addDealContact(sam, summit, ct.Aisha, "primary");
  await setStage(summit, "feasibility", 6);
  const riverstone = await deal(jo, "Riverstone – Shop Estate Rollout", "Riverstone Entertainment Ltd", "22000", { "p.lead_source": "SBC Barcelona", "p.integration_type": VANILLA });
  await setStage(riverstone, "proposal", 12);
  const bluebay2 = await deal(sam, "Bluebay – Sportsbook Add-on", "Bluebay Gaming Ltd", "15000", { "p.via_aggregator": false, "p.lead_source": "Independently sourced", "p.integration_type": VANILLA, "p.billing_currency": "EUR" });
  await setStage(bluebay2, "legal_compliance", 4);
  const kestrelWon = await deal(jo, "Kestrel – Retail Screens", "Kestrel Sports Ltd", "7000", { "p.via_aggregator": false, "p.lead_source": "Kiron Marketing", "p.integration_type": VANILLA });
  await setStage(kestrelWon, "closed_won", 2);
  const live1 = await deal(sam, "Northgate – Live Casino", "Northgate Bets Ltd", "30000", { "p.via_aggregator": false, "p.lead_source": "SBC Barcelona", "p.integration_type": VANILLA, "p.billing_currency": "USD", "p.agreement_signed_internally": true });
  await addDealContact(sam, live1, ct.Luca, "primary");
  await setStage(live1, "live_direct", 210);
  const live2 = await deal(jo, "Summit – Virtual Football", "Summit Play Ltd", "11000", { "p.lead_source": "ICE Barcelona 2025", "p.via_aggregator": true, viaAggregatorId: co["Example Aggregator Ltd"], "p.integration_type": VANILLA });
  await setStage(live2, "live_aggregator", 120);
  const live3 = await deal(sam, "Harbour – Instant Win", "Harbour Lotteries Ltd", "16000", { "p.via_aggregator": false, "p.lead_source": "Independently sourced", "p.integration_type": VANILLA, "p.agreement_signed_internally": true });
  await setStage(live3, "live_direct", 300);
  const stale = await deal(jo, "Copperline – Kiosk Pilot", "Copperline Retail Ltd", "3000", { "p.lead_source": "SBC Barcelona" });
  await setStage(stale, "customer_engagement", 61); // will go On Hold

  await addCollaborator(sam, bluebay, alex.id);
  await addCollaborator(sam, live1, alex.id);
  await addCollaborator(sam, bluebay2, alex.id); // direct deals get their AM at Proposal
  // Won and live clients are looked after by the account manager; Sales stays on as collaborator.
  for (const id of [kestrelWon, live1, live2, live3]) {
    await db.execute(sql`delete from deal_collaborators where deal_id = ${id} and user_id = ${alex.id}`);
    await db.execute(sql`insert into deal_collaborators (deal_id, user_id) select id, owner_id from deals where id = ${id} on conflict do nothing`);
    await db.execute(sql`update deals set owner_id = ${alex.id} where id = ${id}`);
  }

  // Activity
  await logActivity(sam, { type: "call", body: "Intro call with Priya. Interested in 20 casino titles for the web platform; wants pricing by Friday.", dealId: bluebay, occurredAt: new Date(Date.now() - 2 * DAY).toISOString() });
  await logActivity(sam, { type: "meeting", subject: "Demo at their office", body: "Showed the live casino suite. Tom asked about EUR billing.", dealId: bluebay, occurredAt: new Date(Date.now() - DAY).toISOString() });
  await logActivity(sam, { type: "task", subject: "Send Bluebay the pricing pack", dealId: bluebay, dueAt: new Date(Date.now() + 2 * DAY).toISOString() });
  await logActivity(sam, { type: "task", subject: "Chase Harbour for the integration type", dealId: harbour, dueAt: new Date(Date.now() - DAY).toISOString() });
  await logActivity(sam, { type: "task", subject: "Book feasibility review for Summit", dealId: summit, dueAt: new Date(Date.now() + 5 * DAY).toISOString() });
  await logActivity(sam, { type: "note", body: "Maria prefers email. Pilot in 5 shops first.", contactId: ct.Maria });

  // Placing deals by hand above set off automatic moves; clear those so the history and
  // notifications only show what happens next.
  await db.execute(sql`delete from notifications; delete from audit_log where action = 'stage'`);

  // Things KRM does by itself
  await updateRecord(sam, "deal", copperline, { "p.lead_source": "SBC Barcelona", amountMonthly: "6000" }, { "p.lead_source": null, amountMonthly: null }); // moves on
  await runDailyRules();
  await raiseAddendum(alex, live3, { type: "new_product", details: "Add the new scratchcard range to their site from next month." });

  return { deals: 15 };
}

// "auto" is for the online test version's build: loads the example company only when
// EXAMPLE_DATA=1 and the database is still empty, otherwise does nothing.
async function auto() {
  if (process.env.EXAMPLE_DATA !== "1") return "EXAMPLE_DATA isn't 1, so no example data.";
  if (!(await isEmpty())) return "The database already has data, so it was left alone.";
  await loadExampleData();
  return "Example data loaded.";
}

if (process.argv[1]?.endsWith("example-data.ts")) {
  const mode = process.argv[2];
  const run = mode === "clear" ? clearExampleData().then(() => "Example data cleared.") : mode === "auto" ? auto() : loadExampleData().then(() => "Example data loaded. Sign in as any example person.");
  run
    .then((message) => console.log(message))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
