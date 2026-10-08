// Screens for step 3 (example data loaded, app running): go-live handovers on a won deal, the
// departments' waiting lists, the deal going Live after the last one, and the Live board.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";

const B = process.env.KRM_URL ?? "http://localhost:3000";
const OUT = new URL("./screenshots", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const psql = (q) => execSync(`psql "${process.env.DATABASE_URL ?? "postgres://crm:crm@localhost:5432/crm_dev"}" -qtAc "${q}"`).toString().trim();
const dealId = (n) => psql(`select id from deals where name = '${n}'`);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
async function as(name, viewport = { width: 1440, height: 1100 }) {
  const p = await (await browser.newContext({ viewport, ...(viewport.width < 500 ? { isMobile: true, deviceScaleFactor: 2 } : {}) })).newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${B}/sign-in`);
  await p.fill("#who", name.split(" ")[0]);
  await p.click(`button:has-text('${name}')`);
  await p.waitForURL(/deals/);
  return p;
}
// Freeze the ticker so pictures are steady.
const settle = async (p) => { await p.waitForLoadState("networkidle"); await p.addStyleTag({ content: "header { position: static !important; } .ticker, .blink { animation: none !important; }" }); await p.waitForTimeout(200); };
const part = async (p, sel, n) => { await settle(p); await p.locator(sel).first().screenshot({ path: `${OUT}/${n}.png` }); };
const check = (ok, what) => { if (!ok) { errors.push(`Expected: ${what}`); console.error("✗", what); } else console.log("✓", what); };
const kestrel = `${B}/deals/${dealId("Kestrel – Retail Screens")}`;

// 1. Support's list, then the deal's handovers, then Support confirms.
const sky = await as("Sky Support");
await sky.goto(`${B}/tasks`);
await settle(sky);
check(await sky.isVisible("text=Go-live handovers waiting for you (1)"), "Support has one handover waiting");
await sky.screenshot({ path: `${OUT}/80-handover-waiting.png` });
await sky.goto(kestrel);
check(await sky.isVisible("text=2 of 4 confirmed"), "Legal and Finance already confirmed");
check(!(await sky.isVisible("button:has-text('Confirm Finance handover')")), "Support can't confirm Finance");
await part(sky, "section[aria-label=Go-live]", "81-go-live-panel");
await sky.click("button:has-text('Confirm Support handover')");
await sky.fill("#golive-note-support", "Shop screens installed and tested");
await sky.click("section[aria-label=Go-live] button:text-is('Confirm')");
await sky.waitForSelector("text=3 of 4 confirmed");
await part(sky, "section[aria-label=Go-live]", "82-support-confirmed");

// 2. The Live board while Kestrel waits on Dev, and filtered to Dev.
const sam = await as("Sam Sales");
await sam.goto(`${B}/live`);
await settle(sam);
check(await sam.isVisible("text=3/4"), "board shows 3 of 4");
await sam.screenshot({ path: `${OUT}/83-live-board.png`, fullPage: true });
await sam.click("nav[aria-label='Waiting on'] >> text=Finance");
await sam.waitForSelector("text=Nothing waiting on that department.");
await sam.click("nav[aria-label='Waiting on'] >> text=Dev");
await sam.waitForSelector("section[aria-label='Going live'] >> text=Kestrel – Retail Screens");

// 3. Dev (BetMan team, as it's a BetMan Retail deal) confirms last: the deal goes Live by itself.
const dee = await as("Dee Developer");
await dee.goto(kestrel);
check(!(await dee.isVisible("button:has-text('Confirm Dev handover')")), "the VSE team can't confirm a BetMan deal");
const rae = await as("Rae Reviewer");
await rae.goto(kestrel);
await rae.click("button:has-text('Confirm Dev handover')");
await rae.click("section[aria-label=Go-live] button:text-is('Confirm')");
await rae.waitForSelector("text=Live Direct ·");
await rae.evaluate(() => window.scrollTo(0, 0));
await settle(rae);
await rae.screenshot({ path: `${OUT}/84-gone-live.png` });
await sam.goto(`${B}/live`);
await settle(sam);
check(await sam.isVisible("section[aria-label=Live] >> text=Kestrel – Retail Screens"), "Kestrel is on the Live list");
await sam.screenshot({ path: `${OUT}/85-live-board-after.png`, fullPage: true });

// 4. Admin: who confirms what. Phone: the board.
const admin = await as("Admin Example");
await admin.goto(`${B}/admin`);
await part(admin, "section[aria-label='Go-live handovers']", "86-admin-go-live");
const phone = await as("Sam Sales", { width: 390, height: 844 });
await phone.goto(`${B}/live`);
await settle(phone);
await phone.screenshot({ path: `${OUT}/87-phone-live-board.png` });

await browser.close();
const real = errors.filter((e) => !e.includes("caret-color"));
if (real.length) { console.error("Problems:", real); process.exit(1); }
console.log("Step 3 screens OK");
