// Walkthrough of the stage rules on an EMPTY dev database (example data only):
// set rules in Admin, watch a deal move by itself, run the daily rules.
// Usage: npm run dev, then: CRON_SECRET=... node e2e/stage-rules.mjs
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";

const B = process.env.KRM_URL ?? "http://localhost:3000";
const OUT = new URL("./screenshots", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1250 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const step = (s) => console.log("•", s);
const psql = (q) => execSync(`psql "${process.env.DATABASE_URL ?? "postgres://crm:crm@localhost:5432/crm_dev"}" -qtc "${q}"`).toString().trim();

step("setup + fields");
await page.goto(`${B}/setup`);
await page.fill("#name", "Admin Example"); await page.fill("#email", "admin@example.test");
await page.click("text=Create my admin account"); await page.waitForURL(/deals/);
await page.goto(`${B}/admin`);
async function addField(label, type, options = "") {
  await page.fill("#fd-label", label); await page.selectOption("#fd-type", type);
  if (options) await page.fill("#fd-options", options);
  await page.click("button:has-text('Add field')"); await page.waitForSelector(`li >> text=${label}`);
  await page.waitForLoadState("networkidle");
}
await addField("Lead source", "text");
await addField("Integration type", "select", "Vanilla\nCustom");

step("rules for Lead");
const lead = page.locator("li", { has: page.locator("button:has-text('1. Lead')") });
async function addFieldReq(stagePrefix, label) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400); // let the previous save's refresh finish
  await page.selectOption(`#${stagePrefix}-what`, "field");
  await page.selectOption(`#${stagePrefix}-field`, { label });
  await page.click(`#${stagePrefix}-field >> xpath=ancestor::div[contains(@class,'border-dashed')]//button[text()='Add requirement']`);
  await page.waitForSelector(`li >> text=${label}`);
}
await addFieldReq("lead", "Lead source");
await addFieldReq("lead", "Anticipated monthly amount (USD)");
await page.waitForTimeout(400);
await page.selectOption("#lead-what", "has_primary_company");
await page.locator("#lead-what >> xpath=ancestor::div[contains(@class,'border-dashed')]//button[text()='Add requirement']").click();
await page.waitForSelector("text=Contracting company set");

step("branch at Qualified Lead");
await page.click("button:has-text('3. Qualified Lead')");
await addFieldReq("qualified_lead", "Integration type");
await page.waitForTimeout(400);
await page.selectOption("#qualified_lead-to", { label: "Feasibility (RICE)" });
await page.selectOption("#qualified_lead-route-when", { label: "Integration type" });
await page.selectOption("#qualified_lead-route-is", "Custom");
await page.click("button:has-text('Add route')");
await page.waitForSelector("text=when Integration type is Custom");
await page.locator("section[aria-label='Stage rules']").scrollIntoViewIfNeeded();
await page.locator("section[aria-label='Stage rules']").screenshot({ path: `${OUT}/21-admin-stage-rules.png` });

step("deal shows what's missing");
await page.goto(`${B}/companies/new`);
await page.fill("#f-name", "Example Retail Ltd"); await page.selectOption("#f-companyType", "retail");
await page.click("text=Create company"); await page.waitForURL(/companies\/[0-9a-f-]{36}/);
await page.goto(`${B}/deals/new`);
await page.fill("#f-name", "Example Retail – Shops");
await page.fill("#f-primaryCompanyId", "Example Retail"); await page.click("li[role=option] >> text=Example Retail Ltd");
await page.click("text=Create deal"); await page.waitForURL(/deals\/[0-9a-f-]{36}/);
const dealUrl = page.url();
await page.waitForSelector("text=2 of 3 left");
await shot("22-deal-missing");

step("fill in the rest -> moves by itself");
await page.click("section[aria-label=Details] >> text=Edit");
await page.fill("#f-amountMonthly", "8000");
await page.fill("#f-p\\.lead_source", "Trade show");
await page.click("button:has-text('Done')"); // changes save by themselves; Done closes editing
await page.waitForSelector("text=so the deal moved on");
await shot("23-deal-moved");

step("second deal for the board");
await page.goto(`${B}/deals/new`);
await page.fill("#f-name", "Example Online – Web");
await page.click("text=Create deal"); await page.waitForURL(/deals\/[0-9a-f-]{36}/);
await page.goto(`${B}/deals?who=all`);
await shot("24-board-badges");

step("daily rules: 61 days in Lead -> On Hold");
psql(`update deals set stage_entered_at = now() - interval '61 days' where name = 'Example Online – Web'`);
const res = await fetch(`${B}/api/cron/daily`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
console.log("daily:", await res.text());
await page.goto(`${B}/notifications`);
await shot("25-notifications");

console.log("page errors:", errors.length ? errors : "none");
await browser.close();
