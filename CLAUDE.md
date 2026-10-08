# Working on KRM (for Claude)

Kelly explains, Claude codes. Kelly is not a developer: explain in plain words, show screenshots,
and keep everything "idiot-proof, as simple as possible" (her design principle).

## Where things are

- `crm-design.md` — the blueprint. Its **Decision log** at the top wins over anything older below it.
- Live questions page (decisions with Kelly): https://claude.ai/artifact/9PQyT2yfhPTMQktv1rsphb
  (data layout described in `README.md`).
- Business case deck: https://claude.ai/artifact/EGVz8tf1ngU2p9K4w33L2a
- Microsoft sign-in request for IT (Kelly forwards it): https://claude.ai/code/artifact/eafdf14f-baa8-4f75-8240-9ed9e6a2782d
- `crm/` — the app. Read `crm/README.md` first, and `crm/AGENTS.md` (this Next.js version differs from
  older ones; check `crm/node_modules/next/dist/docs/` before using a Next API).
- Pipeline source of truth: the sales playbook in the `kiron-sales-playbook` repo, not `sales_pipeline_process.docx`.
- `brand/krm-logo.webp` — Kelly's KRM logo. Kiron brand: green #5DCF11, white, dark #181923, black; Open Sauce One.

## Hard rules

- **No real client data in the repo or the dev database** — no clients, contacts or deals. Staff names and
  departments are allowed (Kelly, 2026-10-08), but never staff email addresses or phone numbers.
  Tests and walkthroughs use invented `example.test` data only. Leave the dev database blank.
- Run `npm test`, `npm run typecheck`, `npm run lint` in `crm/` before committing.
- Schema changes: edit `crm/src/db/schema.ts`, then `npm run db:generate`, never hand-edit old migrations.
- Permissions live only in `crm/src/lib/permissions.ts`; every server action calls `requireActor()`.

## Local environment

Postgres 16 runs in the container (`pg_ctlcluster 16 main start` if it's down); databases `crm_dev` and
`crm_test`, user `crm`/`crm`. Chromium for screenshots: `CHROMIUM_PATH=/opt/pw-browsers/chromium`.

## Status

See the newest entries in the Decision log in `crm-design.md`.
