// Screens for step 1 (example data loaded, app running): tier, RICE button, legal entity on the
// company, and the account manager taking over at Closed Won.
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
async function as(name) {
  const p = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${B}/sign-in`); await p.click(`button:has-text('${name}')`); await p.waitForURL(/deals/);
  return p;
}
const settle = async (p) => { await p.waitForLoadState("networkidle"); await p.addStyleTag({ content: "header { position: static !important; }" }); };

const sam = await as("Sam Sales");
// Custom deal: RICE button at the top, tier filled in from the amount.
await sam.goto(`${B}/deals/${dealId("Summit – Custom Racing Feed")}`);
await sam.waitForSelector("text=RICE evaluation ↗");
await settle(sam);
await sam.screenshot({ path: `${OUT}/50-rice-button.png` });

// Legal entity details on the company.
await sam.goto(`${B}/companies/${psql("select id from companies where name = 'Bluebay Gaming Ltd'")}`);
await settle(sam);
await sam.locator("section[aria-label=Details]").screenshot({ path: `${OUT}/51-company-legal-entity.png` });

// Tier fills in by itself when the amount changes.
await sam.goto(`${B}/deals/${dealId("Bluebay – Online Casino Games")}`);
await sam.click("section[aria-label=Details] >> text=Edit");
await sam.fill("#f-amountMonthly", "60000");
await sam.click("button:has-text('Done')");
await sam.waitForSelector("section[aria-label=Details] >> text=$60,000");
await sam.click("summary:has-text('Later stages')"); // the tier sits in a Qualified Lead section
await sam.waitForSelector("section[aria-label=Details] >> text=Tier 1");
await settle(sam);
await sam.locator("section[aria-label=Details]").screenshot({ path: `${OUT}/52-tier-filled.png` });

// A direct deal reaches Closed Won: the AM collaborator takes over.
const id = dealId("Bluebay – Sportsbook Add-on");
const admin = await as("Admin Example");
await admin.goto(`${B}/deals/${id}`);
await admin.click("section[aria-label=Details] >> text=Edit");
await admin.selectOption("#f-p\\.agreement_drafted_and_sent", "yes");
await admin.selectOption("#f-p\\.cdd_kyc_complete", "yes");
await admin.selectOption("#f-p\\.agreement_signed_internally", "yes");
await admin.waitForSelector("text=so the deal moved on"); // each answer saved by itself; the last one moved the deal
await admin.click("button:has-text('Done')");
console.log("stage now:", psql(`select stage_key from deals where id = '${id}'`), "| owner:", psql(`select u.name from deals d join users u on u.id = d.owner_id where d.id = '${id}'`));
await admin.evaluate(() => window.scrollTo(0, 0));
await settle(admin);
await admin.screenshot({ path: `${OUT}/53-closed-won-handover.png` });
const alex = await as("Alex Account-Manager");
await alex.goto(`${B}/notifications`);
await settle(alex);
await alex.screenshot({ path: `${OUT}/54-am-notified.png` });

await admin.goto(`${B}/admin`);
await settle(admin);
await admin.locator("section[aria-label='Buttons on deals']").screenshot({ path: `${OUT}/55-admin-buttons.png` });

await browser.close();
const real = errors.filter((e) => !e.includes("caret-color"));
if (real.length) { console.error(real); process.exit(1); }
console.log("Step 1 screens OK");
