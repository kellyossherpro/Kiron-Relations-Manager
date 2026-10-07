# In-House CRM — Design Notes

> Working document. Captures the thinking behind replacing HubSpot with an in-house CRM module inside the Employee Tools portal (`employee-tools.kironinteractive.com`).

## Decision log

Newest first. When a decision here contradicts a section below, the decision wins until that section is rewritten.

- **2026-10-07 — Blueprint round 3.**
  - Pipeline source of truth confirmed: the sales playbook / HubSpot Deal Process doc. `sales_pipeline_process.docx` is retired.
  - Owners can still move their own deals to On Hold / Closed Lost / Terminated via the reason fields; only admins move between normal stages.
  - On Hold over 60 days → Closed Lost automatically (reason + date filled). Every automatic move is shown on the notification board and the deal timeline.
  - CRM connects to Asana directly (today it's Zapier); HubSpot-to-Asana zaps switched off at cutover.
  - Outlook email logging moves **before** cutover; launch reports include email counts.
  - Quotes parked (not in launch scope).
  - Every deal gets a RICE evaluation button linking to the portal's RICE page.
  - Tiers are MRR ranges (T1 $50k+, T2 $10k–50k, T3 $1k–10k, T4 $0–1k); proposal: tier is set from the monthly amount automatically (awaiting Kelly).
  - Open: HubSpot notice period (urgent, possibly 45–90 days before 31 Dec), Zapier plan and what else uses it, tier rule.
- **2026-10-07 — Blueprint round 2.**
  - **Timeline:** renew HubSpot once on 31 Dec 2026 (fewest seats allowed), switch over before the June 2027 renewal. Contract notice period still to confirm.
  - **Pipeline source of truth:** the sales playbook (`kiron-sales-playbook`) matches live HubSpot; `sales_pipeline_process.docx` is out of date (pending Kelly's confirmation, Q39). Stages: Lead → Customer Engagement → Qualified Lead → Feasibility (RICE, custom only) → Proposal → Legal & Compliance (direct only) → Closed Won → Live Direct / Live via Aggregator, plus Addendum loop for live clients, and On Hold / Closed Lost / Terminated.
  - **Workflows:** 28 active HubSpot workflows collapse into ~8 CRM rules (stage engine, 60-day On Hold, 30/60-day stagnation emails, reason-driven exception moves, addendum loop, RICE link + MRR-from-tier field rules, marketing reminder). No lead assignment or renewal workflows exist.
  - **Asana is a core integration**, not optional: L&C creates Legal and Compliance tasks whose completion fills deal properties; addendums create AM Mission Control tasks and return the deal to Live on completion.
  - **Games** = the Product (Event Type) list, maintained by Kelly; adding games to a live client is a New Product addendum.
  - **On Hold exit:** admin only; the deal page suggests the stage the deal qualifies for.
  - **Support page** replaces Smartsheet with 18 named fields (see page). **Reports** at launch: activity per person and deal status / missing info; email counts arrive with Outlook logging, which may move before cutover.
  - **Mobile:** quick entry on the move (contact, deal, note, call, meeting), not just lookups.
  - **Microsoft 365:** Thabiso (IT) and Darren approve sign-in and email setup.
  - **New open items:** quotes vs proposals (Q44), Asana wiring today (Q43), tier→MRR table and RICE link format (Q42), On Hold→Lost rule (Q41), possible HubSpot workflow 4 bug (Q40), owners' exception moves (Q45), Outlook email logging before cutover (Q38).
- **2026-10-07 — Blueprint round 1 (from the live questions page).** Full answers live on the page; this is the summary.
  - **Guiding principle (Kelly):** it must be idiot-proof and as simple as possible. Every screen does one job; regular users never see settings.
  - **Records:** company identified by legal entity name; Company Type (Retail / Online / Both) makes the website required for Online and Both, optional for Retail; NoWebsite.com retired. Companies can have a parent; deals record the aggregator they came through. A contact needs a name plus an email or phone; email unique when present (Qualified Lead still needs both). Kelly adds fields and dropdown options herself in an admin screen. Several rate lines per deal (type, amount, currency); reports in USD at a monthly rate.
  - **Links:** contacts can belong to several companies (role + current flag). One primary (contracting) company per deal plus linked companies with roles. Finance / Marketing / Support contacts are linked contacts with a role, not typed emails.
  - **People:** Sales and AM at launch, other departments read-only later, nobody external. Everyone sees everything; you edit your own; managers and admins edit all; Legal edits only Legal & Compliance fields. One owner plus collaborators (who can edit and get notifications).
  - **Daily tasks that must be fast:** find and view deals, contacts, companies; log notes, calls, meetings and tasks on deals and contacts; update games provided; see every deal not live yet, why, and what is missing.
  - **Saving:** different fields never clash; same-field clashes ask the second person; changes appear live. Admin-only delete with 30-day restore; duplicate merge required before cutover. Full change history on every record.
  - **Activity at launch:** notes, calls, meetings, tasks (owner, due date, reminder emails, My tasks page). Email logging later with Outlook.
  - **Pipeline:** 60-day clock runs from entering the current stage. Only admins move deals by hand, with a logged reason. Clearing a required field flags the deal but does not move it back. One pipeline at launch.
  - **Integrations:** notifications by email plus in-CRM board (Teams later). The portal keeps generating proposals and contracts; the CRM sends it the deal data. Outlook logging after cutover.
  - **Running it:** EU hosting; phone-friendly for lookups and notes, desktop for full editing; daily backups + own nightly copy, no paid restore add-on. Migration: Kelly exports HubSpot to Excel, cleans it, imports via the CRM's import screen, keeping every HubSpot Record ID column.
  - **HubSpot today:** Sales Hub Professional, 21 core seats, no Marketing Hub. Next invoice $7,172.55 on 31 Dec 2026 (about $14,345/year).
  - **Still open:** returning deals from On Hold (Q18), email counts in reports vs Outlook timing (Q27), Microsoft 365 admin (Q28), Support fields (Q26), workflows export (Q22), games provided (Q36), renewal plan (Q37), Sales Hub extras in use (Q38).
- **2026-10-07 — Standalone app, not a portal tile.** The Employee Tools portal plan (and Patrick as review/deploy gate) is dropped. Kelly + Claude build, host and run the CRM as its own app. Consequences:
  - We own login, hosting, database, backups, scheduled jobs and email sending — no portal to inherit them from.
  - The "unified Company page" pulling Proposals / NDAs / KYC from portal tables is no longer free; it becomes an integration (or is dropped).
  - The Proposals and Contracts zaps do **not** disappear automatically: the portal's document generation still needs deal data, now from our CRM instead of HubSpot.
  - Sections below that assume the portal (Architecture, Cutover, Phase 0, `crm-questions-for-patrick.md`) are superseded and will be rewritten as the blueprint firms up.

## Why we're doing this

- **HubSpot is too complex** for the team — busy UI, too many concepts most people don't use.
- **It's expensive** — and we already pay for the Employee Tools portal that can host our own CRM.
- **Our portal is the better home** — we already have auth, role-gated tile access, and a consistent UX pattern. The CRM becomes another tile alongside Proposals, NDAs, KYC, etc.
- **The killer feature HubSpot can't give us:** a true unified view of a Company that pulls together CRM data + Proposals + NDAs + KYC + Co-Marketing — because all of that already lives in our portal.

## Build and ownership model

- **Kelly is the sole designer and builder**, with AI assistance.
- **Patrick is the portal owner** — review-and-deploy gate, helps with anything portal-level (auth, deployment, DB). Not a co-builder.
- **No dedicated dev team.** Every decision must be maintainable by Kelly + AI long-term. Boring tech, standard patterns, minimal moving parts.
- **Kelly already owns all the domain knowledge.** HubSpot's current setup — properties, workflows, what's used vs. ignored — was built and is maintained by Kelly. No discovery interviews with Sales / AM needed; that knowledge is the design input.

## Approach: solo build, single cutover

This CRM is **not** going to run in parallel with HubSpot at any point. The path is:

- **Phase A — Solo build (sample data).** Kelly is the only user. Fake/sample data. Iterate freely — schema, fields, workflows can change without consequence.
- **Phase B — Solo real use.** Kelly starts using it for actual work where HubSpot isn't the source of truth for the team yet. Real-world stress test, still no team dependency.
- **Phase C — Polish gate.** Kelly decides it's "perfect enough." Definition of done is Kelly's call.
- **Phase D — Cutover (one event).** Single planned moment: bulk import from HubSpot → team training → switch over → retire HubSpot. No parallel running, no drift, no double-entry.

Why: parallel running is the failure mode that kills internal CRM rebuilds — two systems both half-right, sync problems, nobody trusts either one. Solo build avoids it entirely.

## Who uses it (post-cutover)

| Department | Role | Primary Need |
|---|---|---|
| Sales | Owner / writer | Manage contacts, companies, deals, log activity |
| Account Management | Owner / writer | Manage existing accounts, renewals, health |
| Marketing | Reader | View contact lists, campaign attribution |
| Finance | Reader | Closed-won deals, contract values, invoice status |
| Support | Reader (filtered) | Know who to assist per deal (currently via Smartsheet) |
| Leadership | Reader | Pipeline, forecast, activity dashboards |

Same data, different lenses. Role determines which tile(s) appear and what fields/views render.

## Core data model (v1 — keep it small)

Four objects, full stop:

- **Companies** — the account
- **Contacts** — people at the account (FK to Company)
- **Deals** — opportunity with stage, value, owner, close date (FK to Company). **Deals have many properties (~40+) — see Sales Pipeline spec.** Properties drive stage progression.
- **Activities** — notes, calls, emails, meetings on a single timeline (polymorphic FK to Company / Contact / Deal)

Anything beyond this (tickets, sequences, custom property groups, lists-of-lists) is deferred until a real workflow demands it.

## Pipeline stage-gate engine (the heart of the system)

This is the part of the CRM that *isn't* generic — it's specific to how Kelly runs the sales process. Documented in full in `sales_pipeline_process.docx`.

**11 stages:** Lead → Qualified Lead → Customer Engagement → Feasibility (RICE, custom only) → Proposal → Legal & Compliance → Closed Won → Live, plus On Hold / Closed Lost / Terminated as terminal/parking states.

**Stage progression rules:**
- Each stage has a defined list of **required properties**.
- When all required properties for a stage are filled → deal **auto-advances** to next stage.
- If properties remain incomplete for **60 days** → deal **auto-moves to On Hold**.
- **Branching at Customer Engagement:** if `Integration Type = Custom` → goes to Feasibility (RICE). If `Vanilla` → skips RICE, goes to Proposal.

**Document generation triggers:**
- Entering **Proposal** stage → Proposals tile auto-generates a proposal.
- Entering **Legal & Compliance** stage → Contracts tile auto-generates a contract + NDA when needed.

**Departmental handovers** (from `interdepartmental_touch_points` diagram):
- **Dev/Tech:** triggered at Customer Engagement / Feasibility when `Integration Type = RICE`. RICE evaluation needed.
- **Legal:** triggered when deal enters Legal & Compliance. Drafts NDA + contract, requests CDD, gets countersigned.
- **Marketing:** triggered at Closed Won when Marketing Contact Email is added → notification + marketing handover info.
- **Support:** triggered at Closed Won when Support Contact Email is added → notification + support handover info.
- **Finance:** triggered when deal goes Live → notification to Kelly + deal owner, contract forwarded to Finance.

**Notification delivery (two channels, every notification fires both):**
- **Email** to the relevant person(s) — same as HubSpot does today.
- **In-CRM notification board** — a single inbox-style view inside the CRM tile showing every alert for the current user (handovers due, deals stale, stage transitions on owned deals, etc.). Mark-as-read, filter by type. Replaces the scattered HubSpot pop-up pattern with one place to look.

**Implementation note:** the stage engine is fundamentally three rules applied per stage:
1. Required-properties check (advance when complete)
2. 60-day stale timer (move to On Hold)
3. Side effects on entry to certain stages (generate doc / send notification / trigger handover)

Build this once as a generic engine, configure it per stage. Don't hardcode 11 stages of bespoke logic.

### Cross-tile links (the unique value)

A Company page should surface:
- Open deals (CRM)
- Active proposals (Proposals tile)
- Signed NDAs & contracts (NDAs & Contracts tile)
- KYC status (KYC tile)
- Co-marketing campaigns (Co-Marketing tile)
- Tier 1 tracking notes (Tier 1 tile)

This is the unified account view HubSpot pretends to give and doesn't.

## Role-based views (first-load defaults)

- **Sales:** pipeline kanban, "my open deals," "my contacts"
- **Account Management:** "my accounts," upcoming renewals, account health signals
- **Marketing:** contact list (read-only), segmentation, campaign attribution (light)
- **Finance:** closed-won deals this period, contract values, invoice status
- **Support:** filtered deal view — who to contact per active deal (replaces Smartsheet zap)
- **Leadership:** pipeline value, forecast, activity volume by rep

## Workflows to replicate

Kelly to list the actual HubSpot workflows in use (already known — just needs writing down). Likely candidates:
- Lead assignment on inbound
- Deal stage change notifications (Slack/Teams)
- Renewal reminders for AM
- Sales → AM handoff on closed-won

Goal: a one-page list of real workflows. We will almost certainly build far less than HubSpot offers.

## Integrations to replace

### Outlook (Microsoft Graph API)
- Email logging — pull sent/received emails, match by contact email, attach to timeline
- Calendar sync — pull meetings where a contact is an attendee, log to timeline
- Send-from-CRM — nice to have, deferred

### Asana
- Currently lightweight. Decide: full integration (REST API + webhooks for "task on stage change") or just a project URL field on Deals. Lean toward the latter unless usage justifies more.

### Zapier — current zaps to replace
1. **HubSpot → Portal (Proposals)** — pulls deal/company/contact data into the portal to generate proposals. *Replacement:* direct DB read once CRM lives in the portal. The zap disappears entirely.
2. **HubSpot → Portal (Contracts)** — same pattern, generates contracts. *Replacement:* same — direct DB read, zap disappears.
3. **HubSpot → Smartsheet (Support)** — feeds deal info to support team in Smartsheet. *Replacement:* a Support view/tile inside the portal showing exactly the same filtered deal info. Smartsheet dependency goes away.

**Observation:** all three current zaps exist *because* the CRM is external. Moving the CRM in-house collapses them into native portal features. This is a big win.

## Cutover plan (Phase D, one event)

- **Pre-cutover (week before):** final HubSpot data refresh exported (CSV or API). Verify import script against a recent export.
- **Cutover day:** freeze HubSpot edits → final export → import into in-house CRM → team training session → in-house CRM goes live as source of truth.
- **HubSpot kept read-only for ~30 days** as a *reference archive only* (not a working system). After 30 days: full CSV backup stored, subscription cancelled.
- **Owner mapping** — HubSpot user IDs → portal user accounts. Mapping table prepared in advance.
- **Activity history** — Kelly to decide scope: full migration vs. last 12–24 months vs. archive HubSpot export and start fresh.

## Architecture (high level)

- **Frontend:** new tile in the existing Next.js Employee Tools app. Reuses portal auth and layout.
- **Backend:** whatever the portal currently uses (TBD — confirm with Patrick).
- **Database:** same portal DB, new tables for `companies`, `contacts`, `deals`, `activities`. FKs to existing tables (proposals, contracts, kyc, etc.) for the unified-view feature.
- **Auth/RBAC:** extend the existing tile-level access model to field-level / view-level for CRM (Marketing sees contacts but not deal values, etc.).
- **Integrations:** Microsoft Graph for Outlook; native API endpoints for what zaps used to do.

## Won't build (consciously out of scope)

To protect against scope creep and keep this maintainable solo:

- Marketing automation / email sequences
- Forms / landing pages
- Live chat / chatbots
- Ticketing system (separate tile if ever needed, not in CRM)
- Custom property groups / lists-of-lists / dynamic segmentation beyond simple filters
- Mobile app (responsive web only)
- Anything that requires a third-party integration we don't already need

Anything on this list can be revisited later if a real workflow demands it.

## Open questions

Most of these get answered by Patrick (see `crm-questions-for-patrick.md`):

1. Portal stack server-side — confirms where CRM logic lives.
2. How tiles get added, how RBAC works, how DB changes happen, how deploys happen.
3. Microsoft Graph — any existing portal integration to reuse.

Kelly to decide:

4. How much activity history to migrate vs. archive at cutover.
5. Definition of "perfect enough" to trigger Phase D. (Suggest writing this down once Phase A is underway so it's a real finish line, not a moving target.)
6. Reporting scope — which HubSpot reports actually get used, which are noise.

## Phased build

- **Phase 0 — Constraints chat with Patrick.** Lock in stack, DB, auth, deploy process. Update this doc with answers.
- **Phase A — Solo build.** Schema + core CRUD for Companies, Contacts, Deals, Activities. Sample data. Kelly is the only user.
- **Phase B — Solo real use + cross-tile links.** Kelly uses it for real work. Build the unified Company page pulling Proposals, NDAs, KYC, etc.
- **Phase C — Polish gate.** Workflows, Outlook integration, Support view to replace Smartsheet zap. Kelly signs off on "perfect enough."
- **Phase D — Cutover.** Bulk import from HubSpot, team training, switch over, HubSpot → read-only archive.
- **Phase E — Retire HubSpot.** After 30-day archive window, cancel subscription. Zaps for Proposals + Contracts deleted (now direct DB reads).

---

*Next session: meet with Patrick using `crm-questions-for-patrick.md`, then fold his answers into a new "Portal constraints" section here.*
