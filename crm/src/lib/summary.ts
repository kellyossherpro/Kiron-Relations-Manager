import { sql } from "drizzle-orm";
import { db } from "@/db";

// The value of the deals: each deal, each stage, and all of them. "Value" is the anticipated monthly
// amount (USD); a year is 12 of those.

export type StageSummary = { key: string; label: string; kind: string; count: number; monthly: number };
export type DealValue = {
  id: string; name: string; stageKey: string; stageLabel: string; stageKind: string;
  companyName: string | null; ownerName: string | null; monthly: number | null; priority: number | null;
};
export type Totals = { count: number; monthly: number };
export type Summary = {
  stages: StageSummary[];
  deals: DealValue[];
  totals: { active: Totals; selling: Totals; nextUp: Totals; live: Totals; onHold: Totals; closed: Totals };
};

// Stage kinds: open = being sold, won = Closed Won (next up), live/change = live clients,
// parked = On Hold, lost/terminated = closed.
const GROUP: Record<string, keyof Summary["totals"] | null> = { open: "selling", won: "nextUp", live: "live", change: "live", parked: "onHold", lost: "closed", terminated: "closed" };

export async function dealSummary(): Promise<Summary> {
  const [stages, deals] = await Promise.all([
    db.execute(sql`
      select s.key, s.label, s.kind, count(d.id)::int as count, coalesce(sum(d.amount_monthly), 0)::float as monthly
      from pipeline_stages s left join deals d on d.stage_key = s.key and d.deleted_at is null
      group by s.key, s.label, s.kind, s.position order by s.position`),
    db.execute(sql`
      select d.id, d.name, d.stage_key as "stageKey", s.label as "stageLabel", s.kind as "stageKind", c.name as "companyName",
             u.name as "ownerName", d.amount_monthly::float as monthly, d.priority
      from deals d join pipeline_stages s on s.key = d.stage_key
      left join companies c on c.id = d.primary_company_id left join users u on u.id = d.owner_id
      where d.deleted_at is null order by d.amount_monthly desc nulls last, d.name`),
  ]);
  const totals: Summary["totals"] = { active: { count: 0, monthly: 0 }, selling: { count: 0, monthly: 0 }, nextUp: { count: 0, monthly: 0 }, live: { count: 0, monthly: 0 }, onHold: { count: 0, monthly: 0 }, closed: { count: 0, monthly: 0 } };
  for (const s of stages.rows as StageSummary[]) {
    const g = GROUP[s.kind];
    if (g) { totals[g].count += s.count; totals[g].monthly += s.monthly; }
    if (g !== "closed") { totals.active.count += s.count; totals.active.monthly += s.monthly; }
  }
  return { stages: stages.rows as StageSummary[], deals: deals.rows as DealValue[], totals };
}
