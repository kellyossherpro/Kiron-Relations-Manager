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

## How it's built

```
src/db/schema.ts        all tables (one place to read the data model)
drizzle/                SQL migrations, applied in order
src/lib/records.ts      create / save / move stage / delete / restore, with conflict detection
src/lib/permissions.ts  who can do what (one place)
src/lib/fields.ts       built-in fields + admin-defined fields, value checking
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
- **Sign-in** is a development picker (`AUTH_MODE=dev`). Microsoft sign-in replaces it before go-live.
