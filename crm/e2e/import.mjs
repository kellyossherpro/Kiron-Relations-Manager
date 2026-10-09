// "Bring in from HubSpot" on an EMPTY database, with made-up exports (example.test data only):
//   build + start the app, then: node e2e/import.mjs
// Makes the files with e2e/make-hubspot-files.ts, signs up an admin, sets up the playbook, then brings
// in companies (CSV), contacts (CSV) and deals (Excel): check first, then for real, then again (updates).
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const B = process.env.KRM_URL ?? "http://localhost:3000";
const OUT = new URL("./screenshots", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "krm-hubspot-"));
execSync(`npx tsx e2e/make-hubspot-files.ts ${DIR}`, { stdio: "inherit" });
const psql = (q) => execSync(`psql "${process.env.DATABASE_URL ?? "postgres://crm:crm@localhost:5432/crm_dev"}" -qtAc "${q}"`).toString().trim();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("dialog", (d) => d.accept());
const check = (ok, what) => { if (!ok) { errors.push(`Expected: ${what}`); console.error("✗", what); } else console.log("✓", what); };
const settle = async () => { await page.waitForLoadState("networkidle"); await page.addStyleTag({ content: "header { position: static !important; }" }); await page.waitForTimeout(200); };
const part = async (sel, n) => { await settle(); await page.locator(sel).first().screenshot({ path: `${OUT}/${n}.png` }); };

// An admin, the playbook's fields, and Sam (deal owner in the files).
await page.goto(`${B}/setup`);
await page.fill("#name", "Admin Example"); await page.fill("#email", "admin@example.test");
await page.click("text=Create my admin account"); await page.waitForURL(/deals/);
await page.goto(`${B}/admin`);
await page.click("text=Set up the playbook's rules");
await page.waitForSelector("text=Start from the sales playbook", { state: "detached", timeout: 20000 });
await page.fill("#new-name", "Sam Sales"); await page.fill("#new-email", "sam@example.test"); await page.selectOption("#new-role", "sales");
await page.click("button:has-text('Add person')");
await page.waitForSelector("text=sam@example.test");

async function bringIn(tab, file, { shots } = {}) {
  await page.goto(`${B}/admin/import`);
  await page.click(`[role=tab]:has-text('${tab}')`);
  await page.setInputFiles("input[type=file]", path.join(DIR, file));
  await page.waitForSelector("section[aria-label=Columns]");
  if (shots?.columns) await part("section[aria-label=Columns]", shots.columns);
  if (shots?.stages) await part("section[aria-label=Stages]", shots.stages);
  await page.click("text=Check first (changes nothing)");
  await page.waitForSelector("text=Check done: nothing was saved.", { timeout: 30000 });
  if (shots?.check) await part("section[aria-label='Check and bring in']", shots.check);
  await page.click("button:has-text('Bring in')");
  await page.waitForSelector("text=Done.", { timeout: 30000 });
}

await bringIn("1. Companies", "hubspot-companies.csv", { shots: { check: "100-import-check-companies" } });
check(psql("select count(*) from companies") === "3", "3 companies in, the duplicate name skipped");
check(psql("select count(*) from companies where hubspot_id is not null and import_id is not null") === "3", "companies keep their HubSpot Record ID");
await bringIn("2. Contacts", "hubspot-contacts.csv");
check(psql("select count(*) from contacts") === "3" && psql("select count(*) from company_contacts") === "3", "3 contacts in, each linked to its company");

// Deals: the Excel file; "Contract sent (old stage)" has no KRM stage, so pick one.
await page.goto(`${B}/admin/import`);
await page.click("[role=tab]:has-text('3. Deals')");
await page.setInputFiles("input[type=file]", path.join(DIR, "hubspot-deals.xlsx"));
await page.waitForSelector("section[aria-label=Stages]");
check(await page.locator("select[aria-label='Where Old HubSpot field goes']").inputValue() === "", "an unknown column is left out");
check(await page.locator("select[aria-label='Where Customer tier goes']").inputValue() === "", "Customer tier is left out (KRM works it out)");
await part("section[aria-label=Columns]", "101-import-columns");
await page.locator("section[aria-label=Stages] label:has-text('Contract sent (old stage)') select").selectOption("customer_engagement");
await part("section[aria-label=Stages]", "102-import-stages");
await page.click("text=Check first (changes nothing)");
await page.waitForSelector("text=Check done: nothing was saved.", { timeout: 30000 });
check(psql("select count(*) from deals") === "0", "the check saved nothing");
await part("section[aria-label='Check and bring in']", "103-import-check-deals");
await page.click("button:has-text('Bring in')");
await page.waitForSelector("text=Done.", { timeout: 30000 });
check(psql("select string_agg(stage_key || ':' || coalesce(properties->>'customer_tier', '-'), ',' order by hubspot_id) from deals") === "proposal:Tier 2,live_direct:Tier 3,customer_engagement:Tier 3", "deals at their stages, tiers worked out");
check(psql("select count(*) from notifications") === "0", "nobody was notified");
const harbour = psql("select id from deals where hubspot_id = '7002'");
check(psql(`select properties->>'live_date' from deals where id = '${harbour}'`) === "2025-08-31", "Excel dates read as dates");

// Running it again updates instead of duplicating; the deal shows where it came from.
await bringIn("3. Deals", "hubspot-deals.xlsx");
check(psql("select count(*) from deals") === "3", "a second run updates the same 3 deals");
await page.goto(`${B}/deals/${harbour}`);
await page.click("summary:has-text('History')");
check(await page.isVisible("text=Brought in from HubSpot"), "the deal's history says it came from HubSpot");
await page.goto(`${B}/admin/import`);
await part("section[aria-label='Past imports']", "104-import-past");

await browser.close();
const real = errors.filter((e) => !e.includes("caret-color"));
if (real.length) { console.error("Problems:", real); process.exit(1); }
console.log("Import walkthrough OK");
