// The "Set up the playbook's rules" button on an EMPTY database (example data only):
//   npm run dev (or build + start), then: node e2e/playbook.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const B = process.env.KRM_URL ?? "http://localhost:3000";
const OUT = new URL("./screenshots", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const section = (n) => page.locator("section[aria-label='Stage rules']").screenshot({ path: `${OUT}/${n}.png` });

await page.goto(`${B}/setup`);
await page.fill("#name", "Admin Example"); await page.fill("#email", "admin@example.test");
await page.click("text=Create my admin account"); await page.waitForURL(/deals/);
await page.goto(`${B}/admin`);
await page.addStyleTag({ content: "header { position: static !important; }" });
await page.waitForSelector("text=Start from the sales playbook");
await section("40-playbook-button");
await page.click("text=Set up the playbook's rules");
await page.waitForSelector("text=Start from the sales playbook", { state: "detached", timeout: 20000 });
await page.click("button:has-text('5. Proposal')");
await page.addStyleTag({ content: "header { position: static !important; }" });
await section("41-playbook-rules");
await browser.close();
if (errors.filter((e) => !e.includes("caret-color")).length) { console.error(errors); process.exit(1); }
console.log("Playbook setup OK");
