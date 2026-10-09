// Kelly's first tweaks (example data loaded, app running): the menu folds away, Live board first,
// Next up, Priorities (one number per deal, move up/down), Summary of deal values.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";

const B = process.env.KRM_URL ?? "http://localhost:3000";
const OUT = new URL("./screenshots", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const psql = (q) => execSync(`psql "${process.env.DATABASE_URL ?? "postgres://crm:crm@localhost:5432/crm_dev"}" -qtAc "${q}"`).toString().trim();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const check = (ok, what) => { if (!ok) { errors.push(`Expected: ${what}`); console.error("✗", what); } else console.log("✓", what); };
async function as(name) {
  const p = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${B}/sign-in`); await p.fill("#who", name.split(" ")[0]); await p.click(`button:has-text('${name}')`); await p.waitForURL(/deals/);
  return p;
}
const settle = async (p) => { await p.waitForLoadState("networkidle"); await p.addStyleTag({ content: ".ticker, .blink { animation: none !important; }" }); await p.waitForTimeout(250); };

const admin = await as("Admin Example");
// Menu: it slides out from the Menu button, Live board first, and closes when a page is picked.
await admin.goto(`${B}/live`);
await settle(admin);
check(!(await admin.isVisible("aside[aria-label=Menu]")), "pages open with the menu closed, using the whole width");
await admin.screenshot({ path: `${OUT}/110-live-board.png` });
await admin.click("button[aria-label='Open the menu']");
await admin.waitForSelector("aside[aria-label=Menu]");
const first = await admin.locator("aside[aria-label=Menu] nav a").first().textContent();
check(first?.trim() === "Live board", `Live board is first in the menu (${first})`);
await admin.screenshot({ path: `${OUT}/111-menu-open.png` });
await admin.click("aside[aria-label=Menu] >> text=Next up");
await admin.waitForURL(/next-up/);
await admin.waitForSelector("aside[aria-label=Menu]", { state: "detached" });
check(true, "picking a page closes the menu");

await admin.goto(`${B}/next-up`);
await settle(admin);
check(await admin.isVisible("text=Kestrel – Retail Screens"), "Next up lists the won deal");
await admin.screenshot({ path: `${OUT}/112-next-up.png` });

// Priorities: board in order; move one up; a taken number can't be picked on a deal.
await admin.goto(`${B}/priorities`);
await settle(admin);
await admin.screenshot({ path: `${OUT}/113-priorities.png` });
await admin.click("button[aria-label='Move Riverstone – Shop Estate Rollout up']");
await admin.waitForFunction(() => document.querySelector("section[aria-label='Priority list'] tbody tr:nth-child(2)")?.textContent?.includes("Riverstone"));
check(psql("select priority from deals where name like 'Riverstone%'") === "2", "moving up swaps the numbers");
const kestrel = psql("select id from deals where name = 'Kestrel – Virtual Sports'");
await admin.goto(`${B}/deals/${kestrel}`);
const opt = admin.locator(`#priority-${kestrel} option[value='1']`);
check(await opt.isDisabled() && (await opt.textContent()).includes("taken by"), "a number another deal has can't be picked");
await admin.selectOption(`#priority-${kestrel}`, "6");
await admin.waitForFunction(() => document.querySelector("select[id^=priority-]")?.value === "6");
check(psql(`select priority from deals where id = '${kestrel}'`) === "6", "a free number is saved");
await settle(admin);
await admin.locator("main > div > div").first().screenshot({ path: `${OUT}/114-deal-priority.png` });

await admin.goto(`${B}/summary`);
await settle(admin);
await admin.screenshot({ path: `${OUT}/115-summary.png`, fullPage: true });

// Someone who isn't a manager sees the priority but can't change it.
const sam = await as("Sam Sales");
await sam.goto(`${B}/priorities`);
check(!(await sam.isVisible("text=Add to priorities")), "sales can't change priorities");

await browser.close();
const real = errors.filter((e) => !e.includes("caret-color"));
if (real.length) { console.error("Problems:", real); process.exit(1); }
console.log("Tweaks OK");
