// Auto-save on a deal (example data loaded, app running): typed fields save after a pause,
// picked answers straight away, each with a "Changes saved" message; nothing to press but Done.
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
const p = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
p.on("pageerror", (e) => errors.push(String(e)));
await p.goto(`${B}/sign-in`); await p.fill("#who", "Sam"); await p.click("button:has-text('Sam Sales')"); await p.waitForURL(/deals/);
const id = psql("select id from deals where name = 'Harbour – Lottery Draw Games'");
await p.goto(`${B}/deals/${id}`);
await p.waitForLoadState("networkidle");
// Details on the left, activity in the middle, linked things on the right (like HubSpot).
const box = async (sel) => (await p.locator(sel).first().boundingBox());
const [d, a, c] = [await box("section[aria-label=Stage]"), await box("section[aria-label=Activity]"), await box("section[aria-label='Contacts on this deal']")];
check(d.x < a.x && a.x < c.x && Math.abs(d.y - a.y) < 50 && Math.abs(a.y - c.y) < 50, "deal information left, activity middle, contacts right");
await p.screenshot({ path: `${OUT}/132-deal-layout.png` });
await p.click("section[aria-label=Details] >> text=Edit");
check(await p.isVisible("text=Changes save by themselves"), "editing says changes save by themselves");
check(!(await p.isVisible("text=Save changes")), "there's no Save button any more");

// A picked answer saves straight away.
await p.selectOption("#f-p\\.billing_currency", "EUR");
await p.waitForSelector("text=Changes saved");
check(psql(`select properties->>'billing_currency' from deals where id = '${id}'`) === "EUR", "a picked answer is saved straight away");
await p.addStyleTag({ content: "header { position: static !important; }" });
await p.screenshot({ path: `${OUT}/130-changes-saved.png` });

// Typing saves once you pause.
await p.fill("#f-p\\.number_of_shops_websites_to_go_live_with", "42");
await p.waitForFunction(() => document.body.innerText.includes("Changes saved"));
await p.waitForTimeout(1800);
check(psql(`select properties->>'number_of_shops_websites_to_go_live_with' from deals where id = '${id}'`) === "42", "typing saves after a pause");

// A value KRM can't use is explained under the field and isn't saved.
await p.fill("#f-amountMonthly", "lots");
await p.waitForSelector("text=must be a number");
check(psql(`select amount_monthly from deals where id = '${id}'`) === "9000.00", "a bad value isn't saved");
await p.locator("section[aria-label=Details]").screenshot({ path: `${OUT}/131-not-saved.png` });
await p.fill("#f-amountMonthly", "9500");
await p.click("button:has-text('Done')");
await p.waitForSelector("section[aria-label=Details] >> text=$9,500");
check(psql(`select amount_monthly from deals where id = '${id}'`) === "9500.00", "fixing it and pressing Done saves it");

await browser.close();
const real = errors.filter((e) => !e.includes("caret-color"));
if (real.length) { console.error("Problems:", real); process.exit(1); }
console.log("Auto-save OK");
