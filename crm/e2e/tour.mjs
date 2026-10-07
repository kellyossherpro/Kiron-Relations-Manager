// Screenshots for the KRM tour, taken on the made-up example data:
//   npm run example:load && npm run dev, then: node e2e/tour.mjs, then npm run example:clear
// Pictures go to e2e/screenshots/tour/.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";

const B = process.env.KRM_URL ?? "http://localhost:3000";
const OUT = new URL("./screenshots/tour", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const step = (s) => console.log("•", s);
const psql = (q) => execSync(`psql "${process.env.DATABASE_URL ?? "postgres://crm:crm@localhost:5432/crm_dev"}" -qtAc "${q}"`).toString().trim();
const dealId = (name) => psql(`select id from deals where name = '${name}'`);
const idOf = (table, col, v) => psql(`select id from ${table} where ${col} = '${v}'`);

async function as(name, viewport = { width: 1440, height: 1100 }) {
  const ctx = await browser.newContext({ viewport, ...(viewport.width < 500 ? { isMobile: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${B}/sign-in`);
  await page.click(`button:has-text('${name}')`);
  await page.waitForURL(/deals/);
  return page;
}
const settle = async (p) => { await p.waitForLoadState("networkidle"); await p.waitForTimeout(300); };
const shot = async (p, n, opts = {}) => { await settle(p); await p.screenshot({ path: `${OUT}/${n}.png`, ...opts }); };
// The page header sticks to the top when scrolling; unstick it so it can't cover a section being photographed.
const part = async (p, sel, n) => {
  await settle(p);
  await p.addStyleTag({ content: "header { position: static !important; }" });
  await p.locator(sel).first().screenshot({ path: `${OUT}/${n}.png` });
};

step("sign-in");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${B}/sign-in`);
  await shot(p, "sign-in");
  await ctx.close();
}

step("board and list");
const sam = await as("Sam Sales");
await sam.goto(`${B}/deals?who=all`);
await shot(sam, "board");
await sam.goto(`${B}/deals?who=all&view=list`);
await shot(sam, "list");

step("deal with checklist, then filling it in");
const bluebay = `${B}/deals/${dealId("Bluebay – Online Casino Games")}`;
await sam.goto(bluebay);
await shot(sam, "deal");
await part(sam, "section[aria-label=Activity]", "activity");
await sam.click("section[aria-label=Details] >> text=Edit");
await sam.selectOption("#f-p\\.lead_source", "Event");
await sam.fill("#f-amountMonthly", "28000");
await part(sam, "section[aria-label=Details]", "deal-editing");
await sam.click("text=Save changes");
await sam.waitForSelector("text=so the deal moved on");
await shot(sam, "deal-moved");

step("two people, same field");
const harbour = `${B}/deals/${dealId("Harbour – Lottery Draw Games")}`;
const morgan = await as("Morgan Manager");
await sam.goto(harbour);
await morgan.goto(harbour);
await sam.click("section[aria-label=Details] >> text=Edit");
await morgan.click("section[aria-label=Details] >> text=Edit");
await sam.fill("#f-amountMonthly", "9500");
await morgan.fill("#f-amountMonthly", "11000");
await sam.click("text=Save changes");
await sam.waitForSelector("section[aria-label=Details] >> text=$9,500");
await morgan.click("text=Save changes");
await morgan.waitForSelector("text=Someone else changed this field while you were editing");
await part(morgan, "section[aria-label=Details]", "conflict");
await morgan.click("text=Keep mine");
await morgan.click("text=Save changes");
await morgan.waitForSelector("section[aria-label=Details] >> text=$11,000");
await sam.goto(harbour);
await sam.click("summary:has-text('History')");
await part(sam, "details:has(summary:has-text('History'))", "history");

step("companies, contacts, validation");
await sam.goto(`${B}/companies/${idOf("companies", "name", "Bluebay Gaming Ltd")}`);
await shot(sam, "company");
await sam.goto(`${B}/contacts/${idOf("contacts", "first_name", "Priya")}`);
await shot(sam, "contact");
await sam.goto(`${B}/companies/new`);
await sam.fill("#f-name", "New Example Ltd");
await sam.selectOption("#f-companyType", "online");
await sam.click("text=Create company");
await sam.waitForSelector("text=Online companies need a website");
await part(sam, "form", "company-validation");

step("tasks, search, notifications");
await sam.goto(`${B}/tasks`);
await shot(sam, "tasks");
await sam.goto(`${B}/search?q=bluebay`);
await shot(sam, "search");
await sam.goto(`${B}/notifications`);
await shot(sam, "notifications");

step("addendums");
const alex = await as("Alex Account-Manager");
await alex.goto(`${B}/addendums`);
await shot(alex, "addendums");
await alex.goto(`${B}/deals/${dealId("Northgate – Live Casino")}`);
await alex.click("text=Raise an addendum");
await alex.click("text=Commercial / Pricing");
await alex.fill("#addendum-details", "Revenue share goes from 10% to 12% from 1 March.");
await part(alex, "section[aria-label=Addendums]", "addendum-raise");
await alex.click("button:has-text('Raise addendum')");
await alex.waitForSelector("text=In progress");
await shot(alex, "addendum-in-progress");
await alex.goto(`${B}/deals/${dealId("Harbour – Instant Win")}`);
await alex.click("button:has-text('Mark as done')");
await alex.fill("#addendum-note", "Scratchcards live on their site.");
await alex.click("button:has-text('Done: back to Live Direct')");
await alex.waitForSelector("text=Past addendums");
await shot(alex, "addendum-done");

step("legal sees only legal fields");
const lee = await as("Lee Legal");
await lee.goto(`${B}/deals/${dealId("Bluebay – Sportsbook Add-on")}`);
await lee.click("section[aria-label=Details] >> text=Edit");
await part(lee, "section[aria-label=Details]", "legal-edit");

step("admin");
const admin = await as("Admin Example");
await admin.goto(`${B}/admin`);
await shot(admin, "admin");
await admin.click("button:has-text('3. Qualified Lead')");
await part(admin, "section[aria-label='Stage rules']", "stage-rules");

step("phone");
const phone = await as("Sam Sales", { width: 390, height: 844 });
await phone.goto(harbour);
await shot(phone, "phone-deal");
await phone.goto(`${B}/tasks`);
await shot(phone, "phone-tasks");

await browser.close();
const real = errors.filter((e) => !e.includes("caret-color")); // the screenshot tool hides the cursor
if (real.length) { console.error("Page errors:", real); process.exit(1); }
console.log("Tour screenshots OK");
