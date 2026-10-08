# KRM app

The Kiron Relations Manager web app. Next.js (App Router, TypeScript) + PostgreSQL via Drizzle.
It starts **completely empty**: the first person to open it creates the admin account, and the only
thing it ships with is the list of pipeline stages (configuration, not data).

## Run it locally

Needs Node 22 and PostgreSQL 16.

```bash
cp .env.example .env          # adjust DATABASE_URL / TEST_DATABASE_URL if needed
npm install
npm run db:migrate            # creates the tables and the stage list
npm run dev                   # http://localhost:3000 → "Set up KRM"
```

| Command | What it does |
|---|---|
| `npm test` | Runs the tests against `TEST_DATABASE_URL` (never the dev database) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run db:generate` | After changing `src/db/schema.ts`, writes a new migration into `drizzle/` |
| `npm run db:migrate` | Applies migrations |
| `npm run e2e` | Clicks through the app in a browser on an empty dev database and saves screenshots to `e2e/screenshots/` (example data only) |
| `npm run e2e:rules` | Same, for the stage rules (needs `CRON_SECRET` in the environment) |
| `npm run e2e:addendum` | Same, for the addendum loop |
| `npm run example:load` | Fills an **empty** database with a made-up example company (people, deals, rules) for demos. Refuses if there's any data |
| `npm run example:clear` | Empties it again. Refuses if anyone in it isn't an `@example.test` person |
| `node e2e/tour.mjs` | With example data loaded and the app running: takes the screenshots for the KRM tour |
| `node e2e/playbook.mjs` | On an empty database with the app running: the "Set up the playbook's rules" button |
| `node e2e/step1.mjs` | With example data loaded and the app running: tier, RICE button, company legal entity, AM handover |
| `npm run rules:daily` | Runs the daily rules by hand (30-day reminders, 60-day On Hold, 60 days On Hold → Closed Lost) |

## How it's built

```
src/db/schema.ts        all tables (one place to read the data model)
drizzle/                SQL migrations, applied in order
src/lib/records.ts      create / save / move stage / delete / restore, with conflict detection
src/lib/permissions.ts  who can do what (one place)
src/lib/fields.ts       built-in fields + admin-defined fields, value checking
src/lib/stage-engine.ts what each stage needs, auto-advance, daily 30/60-day rules
src/lib/stage-rules-admin.ts  admin edits to stage rules; notifications
src/lib/addendums.ts    the addendum loop: raise on a live deal, mark done or cancel, back to Live
src/lib/kiron-pipeline.ts  the sales playbook as fields + stage rules (Admin → "Set up the playbook's rules")
src/lib/conditions.ts   answer matching shared by stage rules and forms ("only show when")
src/lib/settings.ts     company-wide settings (buttons on deals)
src/lib/teams.ts        departments and groups; "Set up Kiron's people" (from kiron-org.ts)
src/lib/kiron-org.ts    Kiron's departments, people, job titles (organogram; never emails or phones)
src/lib/view.ts         what a page may show this person (fields, values, history)
src/lib/go-live.ts      go-live handovers: confirm/undo, who confirms, Live board data (rules in go-live-checks.ts)
src/lib/links.ts        contacts↔companies, deal contacts with roles, collaborators
src/lib/activities.ts   notes, calls, meetings, tasks
src/lib/admin.ts        first admin, people, field definitions
src/lib/queries.ts      read-only queries for pages
src/app/actions.ts      server actions: check who's signed in, call the lib, refresh pages
src/app/(app)/…         signed-in pages; src/app/(auth)/… setup and sign-in
src/components/…        screen pieces (record-fields.tsx has the edit + conflict UI)
```

Rules that matter:

- **Saving**: forms send only changed fields plus the value each had when editing started. Under a row
  lock the server compares; different fields from two people both save, the same field returns a
  conflict and the person chooses. Never "last write wins".
- **Every change is logged** field by field in `audit_log`.
- **Deletes are soft** (`deleted_at`); admins can restore for 30 days.
- **Admin-defined fields** live in `property_definitions` and are stored in each record's `properties`
  JSON, addressed in code as `p.<key>`. Their type can't change after creation.
- **Stage rules** (admin-set): requirements per stage (+ optional "only when field is value") and
  ordered routes to the next stage. A stage with no requirements never moves on its own. Auto-advance
  runs inside the same transaction as the save that completed the stage, so it happens exactly once.
- **Addendums**: raising one on a live deal (type + details) moves it to Addendum; marking it done or
  cancelling it sends the deal back to the Live stage it came from. Each addendum is its own row in
  `addendums`, so nothing on the deal is reset and past addendums stay listed. The Addendum stage can't be
  picked in "Move deal" or used in stage rules; moving a deal out of it by hand cancels the open addendum.
- **Kiron's pipeline** (`kiron-pipeline.ts`) mirrors the sales playbook stage by stage, with HubSpot's field
  names and dropdown options. A requirement can need specific answers ("Technical review performed is Yes");
  a field can be shown only for certain answers of another ("Server name" only when "Dedicated server" is
  Yes). Deal sections for stages not reached yet fold under "Later stages". Lists over 12 options are searched.
- **Filled in by KRM**: a dropdown field can be worked out from a number field by ranges (Customer tier
  from the monthly amount); nobody can type it. A requirement can check the contracting company's fields
  ("company_field"), and saving a company re-checks its deals. At Closed Won the deal is handed to its one
  account manager collaborator (the previous owner stays as collaborator); otherwise the owner is reminded.
- **Departments and groups** (`teams`, `team_members`): a person can be in several. "Set up Kiron's people"
  adds the organogram's departments and people without emails (matched to Microsoft accounts at first sign-in),
  with a starting role by department; it only adds what's missing. A field can be **signed off** by one
  department or group only (`edit_team_id`, e.g. Technical review performed → Technical reviewers); everyone
  in the group is notified when a deal reaches a stage waiting on it, and it shows on their My tasks. Admins
  can always step in. Add backups to the group for holidays.
- **Go-live**: on a won deal, Legal, Finance, Support and Dev each confirm their handover (`go_live_confirmations`,
  one per deal and check). Dev is the platform's team (BetMan → Development (Betman), VSE → Development (VSE),
  anything else → either); Admin → Go-live handovers picks the departments (defaults by name). The stage rule
  "go_live_confirmed" (added at Closed Won by the playbook) holds the deal until all four have confirmed, then
  it moves to Live by itself. When everything else for the stage is in, each department is notified once and
  the deal shows on their My tasks. Confirmations can be undone until the deal goes Live. `/live` is the
  Live board: going-live deals with each handover's status, and every live client; it refreshes every 30 s.
- **Fees and rates** (`commercial` fields) are left out of the page, the values and the history for viewers,
  unless one of their departments "can see fees and rates" (Finance). Other roles always see them.
- **Daily rules** run from `/api/cron/daily` (header `Authorization: Bearer $CRON_SECRET`), once a day.
- **Sign-in** is a development picker (`AUTH_MODE=dev`). Microsoft sign-in replaces it before go-live.

## Online test version (Vercel + Supabase)

A test copy with made-up data, behind a shared password. Vercel runs `npm run vercel-build`, which
applies migrations, loads the example company if `EXAMPLE_DATA=1` and the database is empty, then builds.
Project settings: Root Directory `crm`. Environment variables:

| Name | Value |
|---|---|
| `DATABASE_URL` | Supabase → Connect → **Session pooler** connection string, with the database password filled in |
| `AUTH_MODE` | `dev` (the "pick who you are" sign-in; test only) |
| `SITE_PASSWORD` | the password testers type first |
| `CRON_SECRET` | any long random string (Vercel sends it to `/api/cron/daily`, scheduled in `vercel.json`) |
| `EXAMPLE_DATA` | `1` to load the example company into an empty database |

Before any real data: Microsoft sign-in instead of `AUTH_MODE=dev`, remove `SITE_PASSWORD`, and verify
Supabase's certificate in `src/db/config.ts`.

