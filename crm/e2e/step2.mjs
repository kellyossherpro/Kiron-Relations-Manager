// Screens for step 2 (example data loaded, app running): sign-offs by a group, fees and rates
// hidden from people who don't see them, Admin → Departments & groups, and finding people.
// The last part runs "Set up Kiron's people", so blank the database afterwards.
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
  await p.goto(`${B}/sign-in`);
  await p.fill("#who", name.split(" ")[0]);
  await p.click(`button:has-text('${name}')`);
  await p.waitForURL(/deals/);
  return p;
}
const settle = async (p) => { await p.waitForLoadState("networkidle"); await p.addStyleTag({ content: "header { position: static !important; }" }); await p.waitForTimeout(200); };
const part = async (p, sel, n) => { await settle(p); await p.locator(sel).first().screenshot({ path: `${OUT}/${n}.png` }); };
const check = (ok, what) => { if (!ok) { errors.push(`Expected: ${what}`); console.error("✗", what); } else console.log("✓", what); };

// 1. The technical reviewer: told, listed, and signs off.
const rae = await as("Rae Reviewer");
await rae.goto(`${B}/tasks`);
await settle(rae);
await rae.screenshot({ path: `${OUT}/60-signoff-waiting.png` });
check(await rae.isVisible("text=Waiting for your sign-off (1)"), "Rae has one sign-off waiting");
await rae.goto(`${B}/notifications`);
await settle(rae);
await rae.screenshot({ path: `${OUT}/61-signoff-notification.png` });
await rae.goto(`${B}/deals/${dealId("Harbour – Lottery Draw Games")}`);
await rae.click("section[aria-label=Details] >> text=Edit");
const editable = await rae.locator("section[aria-label=Details] input:not([type=hidden]), section[aria-label=Details] select").count();
check(editable >= 1 && editable <= 2, `Rae can fill in only the technical review (${editable} inputs)`);
await rae.locator("text=Technical review performed").first().scrollIntoViewIfNeeded();
await part(rae, "section[aria-label=Details]", "62-reviewer-edit");

// 2. Fees and rates: Support doesn't see them, Finance does.
const riverstone = `${B}/deals/${dealId("Riverstone – Shop Estate Rollout")}`;
const sky = await as("Sky Support");
await sky.goto(riverstone);
await settle(sky);
check(!(await sky.isVisible("text=Setup fee (USD)")), "Support doesn't see the setup fee");
await part(sky, "section[aria-label=Details]", "63-fees-hidden-support");
const fran = await as("Fran Finance");
await fran.goto(riverstone);
await settle(fran);
check(await fran.isVisible("text=Setup fee (USD)"), "Finance sees the setup fee");
await part(fran, "section[aria-label=Details]", "64-fees-shown-finance");

// 3. Admin: departments and groups, adding a backup reviewer, the field settings.
const admin = await as("Admin Example");
await admin.goto(`${B}/admin`);
await part(admin, "section[aria-label='Departments and groups']", "65-departments-groups");
const group = admin.locator("section[aria-label='Departments and groups'] details:has(summary:has-text('Technical reviewers'))");
await group.locator("input[placeholder^='Add someone']").fill("Morgan");
await admin.click("li[role=option] >> text=Morgan Manager");
await group.locator("button:has-text('Add')").click();
await admin.waitForSelector("section[aria-label='Departments and groups'] details:has(summary:has-text('Technical reviewers')) >> text=Morgan Manager");
await part(admin, "section[aria-label='Departments and groups'] details:has(summary:has-text('Technical reviewers'))", "66-backup-added");
// Hold on to the row itself: once it's being edited its text is inside inputs.
const tr = await admin.locator("section[aria-label=Fields] li:has-text('Technical review performed')").first().elementHandle();
await (await tr.$("button:has-text('Edit')")).click();
await settle(admin);
await tr.screenshot({ path: `${OUT}/67-field-signoff-setting.png` });

// 4. Kiron's real people in one click, then finding them.
await admin.click("button:has-text('Set up Kiron')");
await admin.waitForSelector("text=people added");
await admin.fill("#people-find", "Finance");
await part(admin, "section[aria-label=People]", "68-people-finance");
await admin.fill("#people-find", "");
await admin.reload();
await part(admin, "section[aria-label='Departments and groups']", "69-kiron-departments");
const signIn = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await signIn.goto(`${B}/sign-in`);
await signIn.fill("#who", "osw");
await settle(signIn);
await signIn.screenshot({ path: `${OUT}/70-sign-in-search.png` });

await browser.close();
const real = errors.filter((e) => !e.includes("caret-color"));
if (real.length) { console.error("Problems:", real); process.exit(1); }
console.log("Step 2 screens OK");
