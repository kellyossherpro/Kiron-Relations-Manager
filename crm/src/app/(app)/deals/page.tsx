import Link from "next/link";
import { money, plural } from "@/lib/format";
import { canCreate } from "@/lib/permissions";
import { listDeals, listStages, type DealCard } from "@/lib/queries";
import { requireActor } from "@/lib/session";
import { missingByDeal } from "@/lib/stage-engine";

export const metadata = { title: "Deals" };

const OUT_OF_PIPELINE = ["parked", "lost", "terminated"];

// Highlight deals the 30/60-day rules apply to (still being sold) once they've sat for 30 days.
const looksStuck = (d: DealCard) => ["open", "won"].includes(d.stageKind) && d.daysInStage >= 30;

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ view?: string; who?: string }> }) {
  const actor = await requireActor();
  const { view = "board", who = "mine" } = await searchParams;
  const [stages, deals, missing] = await Promise.all([listStages(), listDeals(who === "all" ? {} : { ownerId: actor.id }), missingByDeal()]);
  const active = stages.filter((s) => !OUT_OF_PIPELINE.includes(s.kind));
  const parked = stages.filter((s) => OUT_OF_PIPELINE.includes(s.kind));
  const byStage = (key: string) => deals.filter((d) => d.stageKey === key);
  const qs = (v: Record<string, string>) => `?${new URLSearchParams({ view, who, ...v })}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Deals</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-line bg-white p-0.5 text-sm font-bold">
            <Link href={qs({ who: "mine" })} className={`rounded-md px-3 py-1.5 ${who !== "all" ? "bg-ink text-white" : ""}`}>Mine</Link>
            <Link href={qs({ who: "all" })} className={`rounded-md px-3 py-1.5 ${who === "all" ? "bg-ink text-white" : ""}`}>Everyone&apos;s</Link>
          </div>
          <div className="flex rounded-lg border border-line bg-white p-0.5 text-sm font-bold">
            <Link href={qs({ view: "board" })} className={`rounded-md px-3 py-1.5 ${view !== "list" ? "bg-ink text-white" : ""}`}>Board</Link>
            <Link href={qs({ view: "list" })} className={`rounded-md px-3 py-1.5 ${view === "list" ? "bg-ink text-white" : ""}`}>List</Link>
          </div>
          {canCreate(actor) && <Link href="/deals/new" className="btn-primary">New deal</Link>}
        </div>
      </div>

      {deals.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-lg font-black uppercase">No deals yet</p>
          <p className="mt-1 text-sm text-muted">{who === "all" ? "Nobody has added a deal yet." : "You don't own or collaborate on any deals yet."}</p>
          {canCreate(actor) && <Link href="/deals/new" className="btn-primary mt-4">Add the first deal</Link>}
        </div>
      ) : view === "list" ? (
        <DealTable deals={deals} missing={missing} stageLabel={(k) => stages.find((s) => s.key === k)?.label ?? k} />
      ) : (
        <>
          <div className="-mx-4 overflow-x-auto px-4 pb-2 lg:-mx-8 lg:px-8">
            <div className="flex gap-3">
              {active.map((s) => {
                const list = byStage(s.key);
                return (
                  <section key={s.key} className="w-64 shrink-0" aria-label={s.label}>
                    <header className="mb-2 flex items-baseline justify-between border-t-4 border-brand pt-2">
                      <h2 className="text-xs font-black tracking-wider uppercase">{s.label}</h2>
                      <span className="text-xs font-bold text-muted tabular-nums">{list.length}</span>
                    </header>
                    <ul className="space-y-2">
                      {list.map((d) => <DealCardView key={d.id} d={d} missing={missing[d.id]} />)}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
          {parked.some((s) => byStage(s.key).length) && (
            <section className="card p-5">
              <h2 className="h2 mb-3">Out of the pipeline</h2>
              <DealTable deals={deals.filter((d) => parked.some((s) => s.key === d.stageKey))} missing={missing} stageLabel={(k) => stages.find((s) => s.key === k)?.label ?? k} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function DealCardView({ d, missing }: { d: DealCard; missing?: { missing: number; total: number } }) {
  return (
    <li>
      <Link href={`/deals/${d.id}`} className="card block p-3 transition-colors hover:border-ink">
        <p className="text-sm font-bold">{d.name}</p>
        {d.companyName && <p className="text-xs text-muted">{d.companyName}</p>}
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="font-bold">{money(d.amountMonthly)}{d.amountMonthly ? "/mo" : ""}</span>
          <span className={looksStuck(d) ? "font-bold text-warn" : "text-muted"}>{plural(d.daysInStage, "day")} in stage</span>
        </div>
        {d.ownerName && <p className="mt-1 text-xs text-muted">{d.ownerName}</p>}
        {missing && missing.missing > 0 && <p className="pill mt-2 bg-warn-soft text-warn">{missing.missing} of {missing.total} still needed</p>}
      </Link>
    </li>
  );
}

function DealTable({ deals, stageLabel, missing }: { deals: DealCard[]; stageLabel: (k: string) => string; missing: Record<string, { missing: number; total: number }> }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-xs tracking-wide text-muted uppercase">
          <tr><th className="p-3">Deal</th><th className="p-3">Company</th><th className="p-3">Stage</th><th className="p-3">Still needed</th><th className="p-3 text-right">Monthly</th><th className="p-3">Owner</th><th className="p-3 text-right">Days in stage</th></tr>
        </thead>
        <tbody>
          {deals.map((d) => (
            <tr key={d.id} className="border-b border-line last:border-0 hover:bg-paper">
              <td className="p-3 font-bold"><Link href={`/deals/${d.id}`} className="hover:underline">{d.name}</Link></td>
              <td className="p-3">{d.companyName ?? "—"}</td>
              <td className="p-3">{stageLabel(d.stageKey)}</td>
              <td className={`p-3 ${missing[d.id]?.missing ? "font-bold text-warn" : "text-muted"}`}>{missing[d.id] ? (missing[d.id].missing ? `${missing[d.id].missing} of ${missing[d.id].total}` : "Nothing") : "—"}</td>
              <td className="p-3 text-right tabular-nums">{money(d.amountMonthly)}</td>
              <td className="p-3">{d.ownerName ?? "—"}</td>
              <td className={`p-3 text-right tabular-nums ${looksStuck(d) ? "font-bold text-warn" : ""}`}>{d.daysInStage}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
