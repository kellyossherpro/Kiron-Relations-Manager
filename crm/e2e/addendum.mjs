// Walkthrough of the addendum loop on an EMPTY dev database (example data only):
// a live deal gets an addendum, it shows on the Addendums page, an account manager
// marks it done and the deal goes back to Live.
// Usage: npm run dev, then: node e2e/addendum.mjs
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";

const B = process.env.KRM_URL ?? "http://localhost:3000";
const OUT = new URL("./screenshots", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = () => browser.newContext({ viewport: { width: 1440, height: 1250 } });
const page = await (await ctx()).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const step = (s) => console.log("•", s);
const psql = (q) => execSync(`psql "${process.env.DATABASE_URL ?? "postgres://crm:crm@localhost:5432/crm_dev"}" -qtc "${q}"`).toString().trim();

step("setup: admin, an account manager, a live deal");
await page.goto(`${B}/setup`);
await page.fill("#name", "Admin Example"); await page.fill("#email", "admin@example.test");
await page.click("text=Create my admin account"); await page.waitForURL(/deals/);
psql(`insert into users (name, email, role) values ('Alex Account-Manager', 'am@example.test', 'account_manager')`);
await page.goto(`${B}/companies/new`);
await page.fill("#f-name", "Example Gaming Ltd"); await page.selectOption("#f-companyType", "retail");
await page.click("text=Create company"); await page.waitForURL(/companies\/[0-9a-f-]{36}/);
await page.goto(`${B}/deals/new`);
await page.fill("#f-name", "Example Gaming – Retail");
await page.fill("#f-primaryCompanyId", "Example Gaming"); await page.click("li[role=option] >> text=Example Gaming Ltd");
await page.click("text=Create deal"); await page.waitForURL(/deals\/[0-9a-f-]{36}/);
const dealUrl = page.url();
await page.click("button:has-text('Move deal')");
await page.selectOption("#move-to", { label: "Live Direct" });
if (await page.locator("#move-to option", { hasText: /^Addendum$/ }).count()) throw new Error("Addendum should not be in Move deal");
await page.fill("#move-reason", "Example: contract signed, client live");
await page.locator("section[aria-label=Stage] >> button:has-text('Move deal')").click();
await page.waitForSelector("section[aria-label=Addendums] >> text=Raise an addendum");
await page.screenshot({ path: `${OUT}/26-live-deal.png` });

step("raise an addendum");
await page.click("text=Raise an addendum");
await page.click("text=Commercial / Pricing");
await page.fill("#addendum-details", "Example: revenue share goes from 10% to 12% from 1 March");
await page.locator("section[aria-label=Addendums]").screenshot({ path: `${OUT}/27-raise-form.png` });
await page.click("button:has-text('Raise addendum')");
await page.waitForSelector("text=In progress");
await page.waitForSelector("section[aria-label=Stage] >> text=Addendum");
await page.screenshot({ path: `${OUT}/28-in-progress.png` });

step("Addendums page");
await page.goto(`${B}/addendums`);
await page.waitForSelector("text=In progress (1)");
await page.screenshot({ path: `${OUT}/29-addendums-page.png` });

step("account manager marks it done");
const am = await (await ctx()).newPage();
am.on("pageerror", (e) => errors.push(String(e)));
await am.goto(`${B}/sign-in`); await am.click("button:has-text('Alex Account-Manager')"); await am.waitForURL(/deals/);
await am.goto(dealUrl);
await am.click("button:has-text('Mark as done')");
await am.fill("#addendum-note", "Example: signed addendum filed");
await am.click("button:has-text('Done: back to Live Direct')");
await am.waitForSelector("text=Past addendums");
await am.waitForSelector("section[aria-label=Stage] >> text=Live Direct");
await am.screenshot({ path: `${OUT}/30-back-to-live.png` });

step("owner is told");
await page.goto(`${B}/notifications`);
await page.waitForSelector("text=Addendum done");
await page.screenshot({ path: `${OUT}/31-notification.png` });

await browser.close();
if (errors.length) { console.error("Page errors:", errors); process.exit(1); }
console.log("Addendum walkthrough OK");
