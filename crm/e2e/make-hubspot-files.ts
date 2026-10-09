// Made-up HubSpot exports for the import walkthrough (example.test data only): companies and contacts
// as CSV, deals as Excel, the way HubSpot's Export gives them. Usage: npx tsx e2e/make-hubspot-files.ts <folder>
import fs from "node:fs";
import path from "node:path";
import { makeXlsx } from "../src/test/xlsx";

const dir = process.argv[2];
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "hubspot-companies.csv"), [
  "Record ID,Company name,Website URL,Company owner,Create Date,Legal entity address",
  "9001,Bluebay Gaming Ltd,bluebay.example.test,Sam Sales,2024-02-01 09:30,\"1 Example Street, London\"",
  "9002,Harbour Lotteries Ltd,harbour.example.test,Sam Sales,2023-11-12 14:00,",
  "9003,Kestrel Sports Ltd,,Former Employee,2025-05-20 08:00,",
  "9004,bluebay gaming ltd,,,,",
].join("\r\n"));
fs.writeFileSync(path.join(dir, "hubspot-contacts.csv"), [
  "Record ID,First Name,Last Name,Email,Phone Number,Job Title,Associated Company IDs",
  "8001,Priya,Example,priya@bluebay.example.test,,Head of Product,9001",
  "8002,Ben,Example,ben@harbour.example.test,,CEO,9002",
  "8003,Grace,Example,,+44 20 0000 0000,Marketing Manager,9003",
  "8004,Nobody,Reachable,,,,9001",
].join("\r\n"));
fs.writeFileSync(path.join(dir, "hubspot-deals.xlsx"), makeXlsx([
  ["Record ID", "Deal Name", "Deal Stage", "Amount", "Deal owner", "Associated Company IDs", "Associated Contact IDs", "Lead source", "Integration type", "Dedicated server", "Product (event type)", "Live date", "Date entered current stage", "Customer tier", "Old HubSpot field"],
  ["7001", "Bluebay – Online Casino Games", "Proposal", 15000, "Sam Sales", "9001", "8001", "LinkedIn", "A Generic (Vanilla) integration", "false", "Horses;Greyhound", "", { date: 46280 }, "Tier 4", "x"],
  ["7002", "Harbour – Lottery Draw Games", "Live Direct", 9000, "Sam Sales", "9002", "8002", "SBC Barcelona", "A Generic (Vanilla) integration", "true", "Keno", { date: 45900 }, { date: 45900 }, "", "y"],
  ["7003", "Kestrel – Virtual Sports", "Contract sent (old stage)", 2500, "Former Employee", "9003", "8003", "Carrier pigeon", "", "maybe", "", "", "", "", ""],
  ["7004", "", "Lead", "", "", "", "", "", "", "", "", "", "", "", ""],
]));
console.log(`Made-up HubSpot files in ${dir}`);
