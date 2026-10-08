import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { FieldType } from "@/db/schema";
import { createFieldDefinition, slugKey } from "./admin";
import { PermissionError, RuleError } from "./errors";
import { PROP_PREFIX } from "./fields";
import { COUNTRIES, PRODUCTS } from "./kiron-pipeline-options";
import { canManageUsersAndFields, type Actor } from "./permissions";
import { dealButtons, setSetting, type DealButton } from "./settings";
import { ensureGroup, TECH_REVIEWERS } from "./teams";
import { addRequirement, addTransition, type RequirementInput } from "./stage-rules-admin";

// Kiron's pipeline as the sales playbook describes it (kiron-sales-playbook repo,
// "Stage by stage"), turned into KRM fields and stage rules. An admin applies it once
// from Admin → Stage rules; after that everything can be changed there as usual.
// Field names and options follow HubSpot's, so the import lines up.

// `shown`: only show the field when another field has one of these answers.
// `company`: the field lives on the company (e.g. its registered address), not the deal.
// `fromAmount`: filled in by KRM from the monthly amount by these minimums, never typed.
// `fees`: fees and rates, hidden from people who don't see commercial terms (Q63).
// `signedOffBy`: only this group fills it in (a sign-off).
type FieldDef = {
  label: string;
  type: FieldType;
  options?: string[];
  group: string;
  legalCanEdit?: boolean;
  shown?: [string, string[]];
  company?: true;
  fromAmount?: [string, number][];
  fees?: true;
  signedOffBy?: string;
};

const G = {
  lead: "Lead",
  ce: "Customer Engagement",
  money: "Qualified Lead: commercials",
  tech: "Qualified Lead: product & technical",
  terms: "Qualified Lead: markets, licensing & terms",
  fees: "Qualified Lead: fees & rates",
  rice: "Feasibility (RICE)",
  proposal: "Proposal",
  legal: "Legal & Compliance",
  won: "Closed Won",
};

const CUSTOM = "A Bespoke (Custom) Integration";

const VARIABLE: [string, string[]] = ["Fee/rate type", ["Variable Rate"]];
const CUSTOM_ONLY: [string, string[]] = ["Integration type", [CUSTOM]];
const DIRECT_ONLY: [string, string[]] = ["Via aggregator", ["No"]];
const tierFields: FieldDef[] = [1, 2, 3, 4, 5].flatMap((n) => [
  { label: `Variable rate tier ${n} from (USD)`, type: "money" as const, group: G.fees, shown: VARIABLE, fees: true as const },
  { label: `Variable rate tier ${n} to (USD)`, type: "money" as const, group: G.fees, shown: VARIABLE, fees: true as const },
  { label: `Variable rate tier ${n} rate %`, type: "number" as const, group: G.fees, shown: VARIABLE, fees: true as const },
]);

export const KIRON_FIELDS: FieldDef[] = [
  // 01 Lead (plus the deal name and the anticipated monthly amount, which are built in)
  { label: "Country where operator is based", type: "select", options: COUNTRIES, group: G.lead },
  {
    label: "Lead source",
    type: "select",
    group: G.lead,
    options: [
      "Kiron Marketing", "Independently sourced", "LinkedIn", "ICE 2022", "SBEA 2022", "SBC Barcelona", "Sigma Malta", "G2E Vegas",
      "ICE 2023", "Sigma Africa", "BIS SIGMA Brazil", "Non-Lead", "SBWA 2023", "ICE 2024", "SBC Rio 2025", "Africa Gaming Expo 2025",
      "SIGMA Africa 2025", "BiG Africa Summit 2025", "Enada 2025", "ICE Barcelona 2025", "GAT Cancún 2025", "SBC Summit Latinoamérica 2024", "ASA",
    ],
  },
  // 02 Customer Engagement. The legal entity is the contracting company itself, so its address
  // and registration number live on the company and are typed once per client (Q52).
  { label: "Legal entity address", type: "textarea", group: "Legal entity", company: true },
  { label: "Registration number", type: "text", group: "Legal entity", company: true },
  { label: "Kiron contracting entity", type: "select", options: ["South Africa", "Mauritius", "Uruguay", "Brazil"], group: G.ce },
  // 03 Qualified Lead
  { label: "Distribution channel", type: "select", options: ["Retail", "Online", "Omni", "Mobile"], group: G.money },
  {
    label: "Customer tier",
    type: "select",
    options: ["Tier 1", "Tier 2", "Tier 3", "Tier 4"],
    group: G.money,
    fromAmount: [["Tier 1", 50_000], ["Tier 2", 10_000], ["Tier 3", 1_000], ["Tier 4", 0]], // Q42
  },
  { label: "B2B or B2C", type: "select", options: ["B2B", "B2C", "B2B and B2C"], group: G.money },
  { label: "Setup fee (USD)", type: "money", group: G.money, fees: true },
  { label: "Monthly minimum amount (USD)", type: "money", group: G.money, fees: true },
  { label: "Billing currency", type: "select", options: ["BRL", "EUR", "GBP", "USD", "ZAR"], group: G.money },
  { label: "Integration type", type: "select", options: ["A Generic (Vanilla) integration", CUSTOM], group: G.tech },
  { label: "Product (event type)", type: "multiselect", options: PRODUCTS, group: G.tech },
  { label: "Distribution platform", type: "select", options: ["3rd Party", "BetMan Online", "BetMan Retail", "Mobile Lite", "VSE", "VSE Only"], group: G.tech },
  { label: "3rd party name", type: "text", group: G.tech, shown: ["Distribution platform", ["3rd Party"]] },
  { label: "Picture solution", type: "select", options: ["Satellite", "Vision X", "In-Shop Render", "Streaming"], group: G.tech },
  { label: "Dedicated server", type: "yesno", group: G.tech },
  { label: "Server name", type: "text", group: G.tech, shown: ["Dedicated server", ["Yes"]] },
  { label: "Server cost to client (USD)", type: "money", group: G.tech, shown: ["Dedicated server", ["Yes"]], fees: true },
  { label: "Technical review performed", type: "yesno", group: G.tech, signedOffBy: TECH_REVIEWERS },
  { label: "Regulated market", type: "yesno", group: G.terms },
  { label: "Market we will operate in", type: "multiselect", options: COUNTRIES, group: G.terms },
  {
    label: "Gambling license applicable",
    type: "select",
    group: G.terms,
    options: [
      "N/A", "UKGC", "Hellenic Gaming Commission", "Spel Inspektionen - Gambling Inspectorate", "Malta Gaming Authority (MGA)",
      "Gambling Commission", "MINCETUR", "Gauteng Gambling Board (GGB)",
    ],
  },
  { label: "Tax applicable", type: "multiselect", options: ["Withholdings Tax", "Gaming Tax", "NGR", "GGR", "None"], group: G.terms },
  { label: "Number of shops/websites to go live with", type: "number", group: G.terms },
  { label: "Termination period", type: "select", options: ["Standard Term (60 days)", "Custom Period"], group: G.terms },
  { label: "Custom termination period (days)", type: "number", group: G.terms, shown: ["Termination period", ["Custom Period"]] },
  { label: "Term of agreement", type: "select", options: ["Standard Term (2 years)", "Custom Term"], group: G.terms },
  { label: "Custom term (years)", type: "number", group: G.terms, shown: ["Term of agreement", ["Custom Term"]] },
  { label: "Fee/rate type", type: "select", options: ["Flat Rate", "Flat Fee", "Variable Rate", "Multiple Rates"], group: G.fees, fees: true },
  { label: "Flat rate %", type: "number", group: G.fees, shown: ["Fee/rate type", ["Flat Rate"]], fees: true },
  { label: "Flat fee amount (USD)", type: "money", group: G.fees, shown: ["Fee/rate type", ["Flat Fee"]], fees: true },
  { label: "Based on GGR/NGR", type: "select", options: ["GGR", "NGR"], group: G.fees, shown: ["Fee/rate type", ["Flat Rate", "Variable Rate", "Multiple Rates"]], fees: true },
  { label: "Multiple rates information", type: "textarea", group: G.fees, shown: ["Fee/rate type", ["Multiple Rates"]], fees: true },
  ...tierFields,
  // 04 Feasibility (RICE), custom integrations only
  { label: "RICE analysis needed", type: "yesno", group: G.rice, shown: CUSTOM_ONLY },
  { label: "RICE full report (link)", type: "url", group: G.rice, shown: CUSTOM_ONLY },
  { label: "RICE board decision", type: "select", options: ["Approved", "Rejected"], group: G.rice, shown: CUSTOM_ONLY },
  { label: "RICE analysis results", type: "textarea", group: G.rice, shown: CUSTOM_ONLY },
  // 05 Proposal
  { label: "Proposal sent to client", type: "yesno", group: G.proposal },
  { label: "Proposal accepted by client", type: "select", options: ["Yes", "No", "No proposal needed"], group: G.proposal },
  { label: "Proposal (link)", type: "url", group: G.proposal, shown: ["Proposal accepted by client", ["Yes"]] },
  { label: "Via aggregator", type: "yesno", group: G.proposal },
  // 06 Legal & Compliance: Legal and Compliance fill the first two. Always shown, so Legal
  // never finds them hidden on a deal whose "Via aggregator" wasn't answered.
  { label: "Agreement drafted and sent", type: "yesno", group: G.legal, legalCanEdit: true },
  { label: "CDD/KYC complete", type: "yesno", group: G.legal, legalCanEdit: true },
  { label: "Agreement signed internally", type: "yesno", group: G.legal },
  // 07 Closed Won (the finance, marketing and support contacts are contacts on the deal with that role)
  { label: "Contract counter-signed date", type: "date", group: G.won, shown: DIRECT_ONLY },
  { label: "Teams group link", type: "url", group: G.won },
  { label: "Included in budget", type: "yesno", group: G.won },
  { label: "Anticipated go-live date", type: "date", group: G.won },
  { label: "IP for whitelisting", type: "text", group: G.won, shown: ["Distribution platform", ["VSE", "VSE Only"]] },
  { label: "Live date", type: "date", group: G.won },
];

const f = (label: string) => {
  if (!KIRON_FIELDS.some((d) => d.label === label)) throw new Error(`Unknown playbook field: ${label}`);
  return PROP_PREFIX + slugKey(label);
};
type Rule = Omit<RequirementInput, "stageKey">;
const need = (label: string, when?: [string, string], mustBe?: string[]): Rule => ({
  kind: "field",
  fieldKey: f(label),
  whenField: when ? f(when[0]) : null,
  whenValue: when?.[1] ?? null,
  requiredValues: mustBe ?? null,
});
const VIA_YES: [string, string] = ["Via aggregator", "Yes"];
const VIA_NO: [string, string] = ["Via aggregator", "No"];

export const KIRON_RULES: Record<string, Rule[]> = {
  lead: [need("Country where operator is based"), need("Lead source"), { kind: "field", fieldKey: "amountMonthly" }],
  customer_engagement: [
    { kind: "has_primary_company" },
    { kind: "company_field", fieldKey: PROP_PREFIX + slugKey("Legal entity address") },
    need("Kiron contracting entity"),
    { kind: "has_contact" },
  ],
  qualified_lead: [
    need("Distribution channel"),
    need("B2B or B2C"),
    need("Setup fee (USD)"),
    need("Monthly minimum amount (USD)"),
    need("Billing currency"),
    need("Integration type"),
    need("Product (event type)"),
    need("Distribution platform"),
    need("3rd party name", ["Distribution platform", "3rd Party"]),
    need("Picture solution"),
    need("Dedicated server"),
    need("Server name", ["Dedicated server", "Yes"]),
    need("Server cost to client (USD)", ["Dedicated server", "Yes"]),
    need("Technical review performed", undefined, ["Yes"]),
    need("Regulated market"),
    need("Market we will operate in"),
    need("Gambling license applicable"),
    need("Tax applicable"),
    need("Number of shops/websites to go live with"),
    need("Termination period"),
    need("Custom termination period (days)", ["Termination period", "Custom Period"]),
    need("Term of agreement"),
    need("Custom term (years)", ["Term of agreement", "Custom Term"]),
    need("Fee/rate type"),
    need("Flat rate %", ["Fee/rate type", "Flat Rate"]),
    need("Based on GGR/NGR", ["Fee/rate type", "Flat Rate"]),
    need("Flat fee amount (USD)", ["Fee/rate type", "Flat Fee"]),
    need("Variable rate tier 1 from (USD)", ["Fee/rate type", "Variable Rate"]),
    need("Variable rate tier 1 to (USD)", ["Fee/rate type", "Variable Rate"]),
    need("Variable rate tier 1 rate %", ["Fee/rate type", "Variable Rate"]),
    need("Based on GGR/NGR", ["Fee/rate type", "Variable Rate"]),
    need("Multiple rates information", ["Fee/rate type", "Multiple Rates"]),
    need("Based on GGR/NGR", ["Fee/rate type", "Multiple Rates"]),
  ],
  feasibility: [need("RICE analysis needed"), need("RICE full report (link)"), need("RICE board decision", undefined, ["Approved"])],
  proposal: [
    need("Proposal sent to client"),
    need("Proposal accepted by client", undefined, ["Yes", "No proposal needed"]),
    need("Proposal (link)", ["Proposal accepted by client", "Yes"]),
    need("Via aggregator"),
    { kind: "field", fieldKey: "viaAggregatorId", whenField: f("Via aggregator"), whenValue: "Yes" },
    { kind: "has_collaborator", whenField: f("Via aggregator"), whenValue: "No" },
  ],
  legal_compliance: [
    need("Agreement drafted and sent", undefined, ["Yes"]),
    need("CDD/KYC complete", undefined, ["Yes"]),
    need("Agreement signed internally", undefined, ["Yes"]),
  ],
  closed_won: [
    need("Contract counter-signed date", VIA_NO),
    { kind: "has_contact", contactRole: "finance" },
    { kind: "has_contact", contactRole: "marketing" },
    { kind: "has_contact", contactRole: "support" },
    need("Teams group link"),
    need("Included in budget"),
    need("Anticipated go-live date"),
    need("IP for whitelisting", ["Distribution platform", "VSE"]),
    need("IP for whitelisting", ["Distribution platform", "VSE Only"]),
    need("Live date"),
  ],
};

// Routes on top of the straight line (Lead → … → Closed Won → Live Direct).
const STRAIGHT_LINE: [string, string][] = [
  ["lead", "customer_engagement"],
  ["customer_engagement", "qualified_lead"],
  ["qualified_lead", "proposal"],
  ["feasibility", "proposal"],
  ["proposal", "legal_compliance"],
  ["legal_compliance", "closed_won"],
  ["closed_won", "live_direct"],
];
const BRANCHES: { from: string; to: string; when: [string, string] }[] = [
  { from: "qualified_lead", to: "feasibility", when: ["Integration type", CUSTOM] },
  { from: "proposal", to: "closed_won", when: VIA_YES },
  { from: "closed_won", to: "live_aggregator", when: VIA_YES },
];

// Buttons on deals (Admin → Buttons on deals). The RICE evaluation is done in the portal (Q42).
const BUTTONS: DealButton[] = [{ label: "RICE evaluation", url: "https://employee-tools.kironinteractive.com/rice", showWhen: null }];
const BUTTON_WHEN: Record<string, [string, string[]]> = { "RICE evaluation": CUSTOM_ONLY };

export function kironPipelineSummary() {
  return {
    fields: KIRON_FIELDS.length,
    rules: Object.values(KIRON_RULES).reduce((n, r) => n + r.length, 0),
    branches: BRANCHES.length,
  };
}

/**
 * Adds the playbook's fields and stage rules. Only when no stage rules exist yet, so it
 * can't double up or overwrite what an admin has set. Fields that already exist with the
 * same name and type are reused.
 */
export async function applyKironPipeline(actor: Actor) {
  if (!canManageUsersAndFields(actor)) throw new PermissionError("Only an admin can set up the stage rules.");
  const existing = await db.execute(sql`select count(*)::int as n from stage_requirements`);
  if ((existing.rows[0].n as number) > 0) throw new RuleError("Stage rules are already set up. Change them stage by stage below.");

  const defs = await db.execute(sql`select object_type, key, type, archived from property_definitions where object_type in ('deal', 'company')`);
  const have = new Map(defs.rows.map((r) => [`${r.object_type}:${r.key}`, r as { type: string; archived: boolean }]));
  const keyOf = (d: FieldDef) => `${d.company ? "company" : "deal"}:${slugKey(d.label)}`;
  for (const d of KIRON_FIELDS) {
    const where = d.company ? "company" : "deal";
    const old = have.get(keyOf(d));
    if (old && old.type !== d.type) throw new RuleError(`A ${where} field called "${d.label}" already exists with a different type. Rename it first.`);
    if (old?.archived) throw new RuleError(`A hidden ${where} field called "${d.label}" already exists. Show it again or rename it first.`);
  }

  for (const d of KIRON_FIELDS) {
    if (have.has(keyOf(d))) continue;
    await createFieldDefinition(actor, {
      objectType: d.company ? "company" : "deal",
      label: d.label,
      type: d.type,
      options: d.options,
      groupLabel: d.group,
      extraEditorRoles: d.legalCanEdit ? ["legal"] : [],
      showWhen: d.shown ? { field: f(d.shown[0]), values: d.shown[1] } : null,
      derive: d.fromAmount ? { from: "amountMonthly", ranges: d.fromAmount.map(([value, min]) => ({ value, min })) } : null,
      commercial: d.fees ?? false,
      editTeamId: d.signedOffBy ? await ensureGroup(d.signedOffBy) : null,
    });
  }
  for (const [stageKey, rules] of Object.entries(KIRON_RULES)) {
    for (const r of rules) await addRequirement(actor, { stageKey, ...r });
  }
  const routes = await db.execute(sql`select from_stage from stage_transitions where when_field is null`);
  const hasPlainRoute = new Set(routes.rows.map((r) => r.from_stage as string));
  for (const [from, to] of STRAIGHT_LINE) if (!hasPlainRoute.has(from)) await addTransition(actor, { fromStage: from, toStage: to });
  for (const b of BRANCHES) await addTransition(actor, { fromStage: b.from, toStage: b.to, whenField: f(b.when[0]), whenValue: b.when[1] });
  const buttons = await dealButtons();
  const missing = BUTTONS.filter((b) => !buttons.some((x) => x.label === b.label)).map((b) => {
    const when = BUTTON_WHEN[b.label];
    return { ...b, showWhen: when ? { field: f(when[0]), values: when[1] } : null };
  });
  if (missing.length) await setSetting("deal_buttons", [...buttons, ...missing]);
  return kironPipelineSummary();
}
