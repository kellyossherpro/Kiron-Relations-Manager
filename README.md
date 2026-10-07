# KRM — Kiron Relations Manager

In-house CRM to replace HubSpot, built as a standalone app (decision 2026-10-07 — see Decision log in `crm-design.md`).

## Documents

- **Blueprint questions (live page):** https://claude.ai/artifact/9PQyT2yfhPTMQktv1rsphb — Kelly answers there; Claude reads the answers, replies and records decisions. Decisions are copied into `crm-design.md`. Page data: `questions` (Claude writes; `decision` + `decidedAt` when settled), `thread` (one doc per message: `qid`, `author` kelly|claude, `choice`, `text`, `at`; never overwritten), `meta/roadmap` (layers). `answers` and `notes` are the round-1 originals, kept as a backup.

- **crm-design.md** — design notes: the why, the shape, the architecture.
- **crm-questions-for-patrick.md** — *superseded* (portal plan dropped); kept for reference.
- **crm-definition-of-done.md** — checklist that triggers cutover from HubSpot.
- **sales_pipeline_process.docx** — *retired*: out of date. The pipeline source of truth is the sales playbook (`kiron-sales-playbook`).

## Status

Building (Phase A, foundation). The app is in `crm/` (see `crm/README.md`). Kelly explains, Claude codes; standalone app.
