// Clicks through KRM like a new user, on an EMPTY dev database, and saves screenshots.
// Usage: start the app (npm run dev), make sure the dev database is empty, then:
//   npm run e2e
// Uses invented example data only. Reset the dev database afterwards if you want it blank.
import { chromium } from "playwright";
const B = process.env.KRM_URL ?? "http://localhost:3000";
const OUT = new URL("./screenshots", import.meta.url).pathname;
await import("node:fs").then((fs) => fs.mkdirSync(OUT, { recursive: true }));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1250 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const step = (s) => console.log("•", s);

step("setup");
await page.goto(`${B}/`);
await page.waitForURL(/setup/);
await shot("01-setup");
await page.fill("#name", "Admin Example");
await page.fill("#email", "admin@example.test");
await page.click("text=Create my admin account");
await page.waitForURL(/deals/);
await shot("02-empty-deals");

step("admin: people and fields");
await page.goto(`${B}/admin`);
for (const [n, e, r] of [["Sam Sales", "sam@example.test", "sales"], ["Lee Legal", "lee@example.test", "legal"]]) {
  await page.fill("#new-name", n); await page.fill("#new-email", e); await page.selectOption("#new-role", r);
  await page.click("text=Add person"); await page.waitForSelector(`text=${n}`);
}
await page.fill("#fd-label", "Billing currency"); await page.selectOption("#fd-type", "select");
await page.fill("#fd-group", "Commercials"); await page.fill("#fd-options", "USD\nEUR\nZAR");
await page.click("button:has-text('Add field')"); await page.waitForSelector("text=USD, EUR, ZAR");
await page.fill("#fd-label", "Agreement signed internally"); await page.selectOption("#fd-type", "yesno");
await page.fill("#fd-group", "Legal & Compliance"); await page.check("text=Legal can edit this field on any deal");
await page.click("button:has-text('Add field')"); await page.waitForSelector("text=Agreement signed internally");
await shot("03-admin");

step("company");
await page.goto(`${B}/companies/new`);
await page.fill("#f-name", "Example Gaming Ltd");
await page.selectOption("#f-companyType", "online");
await page.click("text=Create company");
await page.waitForSelector("text=Online companies need a website");
await shot("04-company-validation");
await page.fill("#f-website", "example-gaming.test");
await page.click("text=Create company");
await page.waitForURL(/companies\/[0-9a-f-]{36}/);

step("contact");
await page.goto(`${B}/contacts/new`);
await page.fill("#f-firstName", "Alex"); await page.fill("#f-lastName", "Example"); await page.fill("#f-email", "alex@example-gaming.test");
await page.click("text=Create contact");
await page.waitForURL(/contacts\/[0-9a-f-]{36}/);
await page.click("text=Add company");
await page.fill("input[placeholder='Type a company name']", "Example");
await page.click("li[role=option] >> text=Example Gaming Ltd");
await page.fill("input[placeholder='Role or job title (optional)']", "Head of Operations");
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.waitForSelector("text=Head of Operations · Current");

step("deal");
await page.goto(`${B}/deals/new`);
await page.fill("#f-name", "Example Gaming – BetMan Online");
await page.fill("#f-amountMonthly", "25000");
await page.fill("#f-primaryCompanyId", "Example");
await page.click("li[role=option] >> text=Example Gaming Ltd");
await page.click("text=Create deal");
await page.waitForURL(/deals\/[0-9a-f-]{36}/);
const dealUrl = page.url();
await page.click("text=Add contact");
await page.fill("input[placeholder=\"Type a contact's name\"]", "Alex");
await page.click("li[role=option] >> text=Alex Example");
await page.selectOption("select[aria-label=Role]", "finance");
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.waitForSelector("text=Finance · alex@example-gaming.test");

step("activity");
await page.fill("#act-body", "Intro call went well. They want a proposal for online only.");
await page.click("text=Add note"); await page.waitForSelector("text=Intro call went well"); await page.waitForSelector("button:has-text('Add note'):not([disabled])"); await page.waitForTimeout(500);
await page.click("role=radio[name=Task]");
await page.fill("#act-subject", "Send the proposal");
await page.fill("#act-when", "2026-10-20");
await page.click("text=Add task"); await page.waitForSelector("text=Send the proposal", { timeout: 8000 });

step("edit details");
await page.click("section[aria-label=Details] >> text=Edit");
await page.selectOption("#f-p\\.billing_currency", "USD");
await page.waitForSelector("text=Changes saved"); // saved as soon as it was picked
await page.click("button:has-text('Done')");
await page.waitForSelector("section[aria-label=Details] >> text=USD");
await shot("05-deal");

step("two people edit the same field");
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 1250 } });
const p2 = await ctx2.newPage();
await p2.goto(`${B}/sign-in`);
await p2.click("button:has-text('Admin Example')");
await p2.waitForURL(/deals/);
await p2.goto(dealUrl);
await page.click("section[aria-label=Details] >> text=Edit");
await p2.click("section[aria-label=Details] >> text=Edit");
await page.fill("#f-amountMonthly", "30000");
await page.click("button:has-text('Done')");
await page.waitForSelector("section[aria-label=Details] >> text=$30,000");
await p2.fill("#f-amountMonthly", "40000");
await p2.waitForSelector("text=Someone else changed this field while you were editing", { timeout: 8000 });
await p2.screenshot({ path: `${OUT}/06-conflict.png`, fullPage: false, clip: undefined });
await p2.click("text=Keep mine");
await p2.waitForSelector("text=Changes saved");
await p2.click("button:has-text('Done')");
await p2.waitForSelector("section[aria-label=Details] >> text=$40,000");

step("history");
await page.goto(dealUrl);
await page.click("summary:has-text('History')");
await shot("07-deal-history");

step("board and tasks");
await page.goto(`${B}/deals?who=all`);
await shot("08-board");
await page.goto(`${B}/tasks`);
await shot("09-tasks");
await page.goto(`${B}/companies`);
await shot("10-companies");

step("legal can only edit legal fields");
const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 1250 } });
const p3 = await ctx3.newPage();
await p3.goto(`${B}/sign-in`);
await p3.click("button:has-text('Lee Legal')");
await p3.waitForURL(/deals/);
await p3.goto(dealUrl);
await p3.click("section[aria-label=Details] >> text=Edit");
const editable = await p3.$$eval("section[aria-label=Details] dd :is(input,select,textarea)", (els) => els.map((e) => e.id));
console.log("legal editable inputs:", editable);

step("phone width");
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const mp = await m.newPage();
await mp.goto(`${B}/sign-in`); await mp.click("button:has-text('Sam Sales')"); await mp.waitForURL(/deals/);
await mp.goto(dealUrl);
await mp.screenshot({ path: `${OUT}/11-phone-deal.png`, fullPage: false });

console.log("page errors:", errors.length ? errors : "none");
await browser.close();
