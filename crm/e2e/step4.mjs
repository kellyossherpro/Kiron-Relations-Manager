// Screens for step 4 (example data loaded, app running, FILE_STORAGE=local): files on a deal, who can
// open them, the download log, and adding a file.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const B = process.env.KRM_URL ?? "http://localhost:3000";
const OUT = new URL("./screenshots", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const psql = (q) => execSync(`psql "${process.env.DATABASE_URL ?? "postgres://crm:crm@localhost:5432/crm_dev"}" -qtAc "${q}"`).toString().trim();
const dealId = (n) => psql(`select id from deals where name = '${n}'`);
const fileId = (n) => psql(`select id from files where name = '${n}'`);
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
const settle = async (p) => { await p.waitForLoadState("networkidle"); await p.addStyleTag({ content: "header { position: static !important; }" }); await p.waitForTimeout(200); };
const part = async (p, sel, n) => { await settle(p); await p.locator(sel).first().screenshot({ path: `${OUT}/${n}.png` }); };
const check = (ok, what) => { if (!ok) { errors.push(`Expected: ${what}`); console.error("✗", what); } else console.log("✓", what); };
const riverstone = `${B}/deals/${dealId("Riverstone – Shop Estate Rollout")}`;
const proposal = fileId("Riverstone proposal v2.pdf");

// 1. The owner sees the proposal, who opened it, and adds another file.
const jo = await as("Jo Sales");
await jo.goto(riverstone);
check(await jo.isVisible("text=Opened 1 time, last by Fran Finance"), "the proposal's opens are counted");
await jo.click("section[aria-label=Files] summary:has-text('Who opened it')");
await part(jo, "section[aria-label=Files]", "90-files-panel");
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "krm-e2e-")), "Riverstone pricing schedule.pdf");
fs.writeFileSync(tmp, fs.readFileSync(path.join(process.cwd(), ".krm-files", psql(`select storage_key from files where id = '${proposal}'`))));
await jo.setInputFiles("section[aria-label=Files] input[type=file]", tmp);
await jo.check("section[aria-label=Files] input[type=radio] >> nth=2");
await jo.check("section[aria-label=Files] label:has-text('Finance') input");
await jo.check("section[aria-label=Files] label:has-text('Sales') input");
await part(jo, "section[aria-label=Files]", "91-adding-a-file");
await jo.click("button:has-text('Add file')");
// (The name shows in the drop box straight away, so wait for the finished file's access line.)
check(!!(await jo.waitForSelector("text=Can open: Only Finance, Sales", { timeout: 15000 }).catch(() => null)), "the new file is limited to Finance and Sales");
await part(jo, "section[aria-label=Files]", "91b-file-added");
await jo.click("summary:has-text('History')");
check(await jo.isVisible("text=Added a file:"), "the deal history shows the file was added (without its name)");

// 2. Support can't open fees-and-rates files: they're not even listed, and the link refuses.
const sky = await as("Sky Support");
await sky.goto(riverstone);
check(await sky.isVisible("text=2 more files you don’t have access to."), "Support is told 2 files are hidden");
await part(sky, "section[aria-label=Files]", "92-files-hidden-from-support");
const denied = await sky.request.get(`${B}/files/${proposal}`);
check(denied.status() === 403, `Support's direct link is refused (${denied.status()})`);

// 3. Finance opens the proposal: the PDF comes back and the open is logged.
const fran = await as("Fran Finance");
const opened = await fran.request.get(`${B}/files/${proposal}`);
check(opened.status() === 200 && opened.headers()["content-type"] === "application/pdf" && (await opened.body()).subarray(0, 5).toString() === "%PDF-", "Finance gets the PDF");
check(psql(`select count(*) from file_downloads where file_id = '${proposal}'`) === "2", "Finance's open is logged");

// 4. Legal's contract: Legal sees it, Sales doesn't.
const northgate = `${B}/deals/${dealId("Northgate – Live Casino")}`;
const lee = await as("Lee Legal");
await lee.goto(northgate);
check(await lee.isVisible("text=Northgate agreement (signed).pdf"), "Legal sees the contract");
await part(lee, "section[aria-label=Files]", "93-legal-contract");
const sam = await as("Sam Sales");
await sam.goto(northgate);
check(!(await sam.isVisible("text=Northgate agreement (signed).pdf")), "Sales doesn't see Legal's contract");

// 5. Phone.
const phone = await as("Jo Sales", { width: 390, height: 844 });
await phone.goto(riverstone);
await phone.locator("section[aria-label=Files]").scrollIntoViewIfNeeded();
await part(phone, "section[aria-label=Files]", "94-phone-files");

await browser.close();
const real = errors.filter((e) => !e.includes("caret-color"));
if (real.length) { console.error("Problems:", real); process.exit(1); }
console.log("Step 4 screens OK");
