import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { makeUser, resetDb } from "@/test/helpers";
import { PermissionError } from "../errors";
import { applyKironPipeline } from "../kiron-pipeline";
import type { Actor } from "../permissions";
import { loadSpecs } from "../records";
import { parseCsv } from "./parse";
import { suggestMapping, suggestStages, type ImportObject } from "./plan";
import { finishImport, importChunk, listImports, rememberedMapping, startImport, undoImport } from "./run";

beforeEach(resetDb);
afterAll(() => pool.end());

// Made-up HubSpot exports (example.test data only).
const COMPANIES = `Record ID,Company name,Website URL,Company owner,Create Date
9001,Bluebay Gaming Ltd,bluebay.example.test,Sam Sales,2024-02-01 09:30
9002,Harbour Lotteries Ltd,,Someone Else,
9003,bluebay gaming ltd,,,`;
const CONTACTS = `Record ID,First Name,Last Name,Email,Phone Number,Associated Company IDs
8001,Priya,Example,priya@bluebay.example.test,,9001
8002,,,tom@harbour.example.test,,9002;9999
8003,Ola,NoWayToReach,,,9001`;
const DEALS = `Record ID,Deal Name,Deal Stage,Amount,Deal owner,Associated Company IDs,Associated Contact IDs,Lead source,Dedicated server,Product (event type),Live date,Date entered current stage,Customer tier
7001,Bluebay – Casino,Proposal,15000,Sam Sales,9001,8001;8002,LinkedIn,true,Horses;Greyhound,2026-12-01 00:00,2026-09-01 08:00,Tier 4
7002,Harbour – Draw Games,Contract Sent (old stage),2500,Nobody Here,Harbour Lotteries Ltd,,Carrier pigeon,maybe,,31/12/2026,,`;

async function run(actor: Actor, objectType: ImportObject, csv: string, opts: { check?: boolean; stageMap?: Record<string, string | null> } = {}) {
  const sheet = parseCsv(csv);
  const mapping = suggestMapping(objectType, sheet.headers, await loadSpecs(db, objectType));
  const importId = opts.check ? null : await startImport(actor, { objectType, fileName: `${objectType}s.csv` });
  const results = await importChunk(actor, { objectType, importId, headers: sheet.headers, rows: sheet.rows, firstRow: 2, mapping, stageMap: opts.stageMap });
  if (importId) await finishImport(actor, importId, objectType, sheet.headers, mapping);
  return { results, importId, mapping, headers: sheet.headers };
}
const count = async (table: string) => (await db.execute(sql`select count(*)::int as n from ${sql.identifier(table)} where deleted_at is null`)).rows[0].n;

describe("bringing in from HubSpot", () => {
  it("matches HubSpot's columns to KRM's fields", async () => {
    await applyKironPipeline(await makeUser("admin"));
    const { headers, mapping } = await run(await makeUser("admin"), "deal", DEALS, { check: true });
    expect(Object.fromEntries(headers.map((h, i) => [h, mapping[i]]))).toEqual({
      "Record ID": "special:hubspotId", "Deal Name": "name", "Deal Stage": "special:stage", Amount: "amountMonthly", "Deal owner": "ownerId",
      "Associated Company IDs": "primaryCompanyId", "Associated Contact IDs": "special:contactLinks", "Lead source": "p.lead_source",
      "Dedicated server": "p.dedicated_server", "Product (event type)": "p.product_event_type", "Live date": "p.live_date",
      "Date entered current stage": "special:stageEnteredAt", "Customer tier": null, // filled in by KRM, so left out
    });
    expect(suggestStages(["Proposal", "Closed won", "Contract Sent (old stage)"], [{ key: "proposal", label: "Proposal" }, { key: "closed_won", label: "Closed Won" }]))
      .toEqual({ Proposal: "proposal", "Closed won": "closed_won", "Contract Sent (old stage)": null });
  });

  it("companies, contacts, deals: a check changes nothing, then the real thing with every problem explained", async () => {
    const admin = await makeUser("admin");
    const sam = await makeUser("sales", "Sam Sales");
    await expect(run(sam, "company", COMPANIES)).rejects.toThrow(PermissionError);
    await applyKironPipeline(admin);

    const check = await run(admin, "company", COMPANIES, { check: true });
    expect(check.results.map((r) => r.outcome)).toEqual(["created", "created", "skipped"]);
    expect(await count("companies")).toBe(0);

    const companies = await run(admin, "company", COMPANIES);
    expect(companies.results.map((r) => [r.outcome, ...r.problems.map((p) => p.message)])).toEqual([
      ["created"],
      ["created", "Nobody with this name is in KRM (Admin → People): left empty"],
      ["skipped", "Another company already has this legal entity name"],
    ]);
    const bluebay = (await db.execute(sql`select id, owner_id, website, created_at from companies where hubspot_id = '9001'`)).rows[0];
    expect(bluebay).toMatchObject({ owner_id: sam.id, website: "https://bluebay.example.test" });
    expect(new Date(bluebay.created_at as string).toISOString()).toBe("2024-02-01T09:30:00.000Z");

    const contacts = await run(admin, "contact", CONTACTS);
    expect(contacts.results.map((r) => [r.outcome, ...r.problems.map((p) => p.message)])).toEqual([
      ["created"],
      ["created", "No first name: saved under the email address", "No company with this HubSpot ID or name (bring companies in first): not linked"],
      ["skipped", "A contact needs an email address or a phone number"],
    ]);
    expect((await db.execute(sql`select count(*)::int as n from company_contacts`)).rows[0].n).toBe(2);

    const stageMap = { Proposal: "proposal", "Contract Sent (old stage)": null };
    const deals = await run(admin, "deal", DEALS, { stageMap });
    expect(deals.results.map((r) => [r.outcome, ...r.problems.map((p) => `${p.column}: ${p.message}`)])).toEqual([
      ["created"],
      ["created",
        'Deal owner: Nobody with this name is in KRM (Admin → People): left empty',
        'Lead source: "Carrier pigeon" isn\'t one of the options: left empty',
        'Dedicated server: "maybe" isn\'t Yes or No: left empty',
        'Live date: "31/12/2026" isn\'t a date KRM can read (use 2026-10-31): left empty',
        "Deal stage: No KRM stage chosen for it: starts in the first stage"],
    ]);
    const d = (await db.execute(sql`select * from deals where hubspot_id = '7001'`)).rows[0];
    expect(d).toMatchObject({ stage_key: "proposal", owner_id: sam.id, primary_company_id: bluebay.id, amount_monthly: "15000.00" });
    expect(d.properties).toMatchObject({ lead_source: "LinkedIn", dedicated_server: true, product_event_type: ["Horses", "Greyhound"], live_date: "2026-12-01", customer_tier: "Tier 2" });
    expect(new Date(d.stage_entered_at as string).toISOString()).toBe("2026-09-01T08:00:00.000Z");
    expect((await db.execute(sql`select count(*)::int as n from deal_contacts where deal_id = ${d.id as string}`)).rows[0].n).toBe(2);
    // Brought in as it stands: no automatic moves, handovers or notifications.
    expect((await db.execute(sql`select count(*)::int as n from notifications`)).rows[0].n).toBe(0);
    expect((await db.execute(sql`select stage_key from deals where hubspot_id = '7002'`)).rows[0].stage_key).toBe("lead");
  });

  it("running it again updates the same records instead of duplicating them; undo removes what an import made", async () => {
    const admin = await makeUser("admin");
    await makeUser("sales", "Sam Sales");
    await applyKironPipeline(admin);
    const first = await run(admin, "company", COMPANIES);
    await run(admin, "deal", DEALS, { stageMap: { Proposal: "proposal" } });

    const changed = DEALS.replace("7001,Bluebay – Casino,Proposal,15000", "7001,Bluebay – Casino,,60000").replace("LinkedIn", "");
    const again = await run(admin, "deal", changed, { stageMap: { Proposal: "proposal" } });
    expect(again.results.map((r) => r.outcome)).toEqual(["updated", "updated"]);
    expect(await count("deals")).toBe(2);
    const d = (await db.execute(sql`select stage_key, amount_monthly, properties from deals where hubspot_id = '7001'`)).rows[0];
    expect(d).toMatchObject({ stage_key: "proposal", amount_monthly: "60000.00" }); // empty stage cell: left as it was
    expect(d.properties).toMatchObject({ lead_source: "LinkedIn", customer_tier: "Tier 1" }); // empty cell keeps the value; tier follows

    expect(await rememberedMapping("deal")).toMatchObject({ dealname: "name", customertier: null });
    expect(await undoImport(admin, first.importId!)).toBe(2);
    expect(await count("companies")).toBe(0);
    await expect(undoImport(admin, first.importId!)).rejects.toThrow("already undone");
    expect((await listImports()).map((i) => [i.objectType, i.created, i.updated, i.skipped, !!i.undoneAt])).toEqual([
      ["deal", 0, 2, 0, false], ["deal", 2, 0, 0, false], ["company", 2, 0, 1, true],
    ]);
  });
});
