import Link from "next/link";
import { BoardFrame, DAY, DealCell, Empty, Stat, sumMonthly } from "@/components/board";
import { date, money } from "@/lib/format";
import { GO_LIVE_CHECKS, goLiveDeals } from "@/lib/go-live";
import { requireActor } from "@/lib/session";

export const metadata = { title: "Next up" };

// Won deals that aren't live yet (Closed Won), with each department's go-live handover. Soonest
// Live date first; "Waiting on" narrows it to one department.
export default async function NextUpPage({ searchParams }: { searchParams: Promise<{ waiting?: string }> }) {
  await requireActor();
  const { waiting } = await searchParams;
  const deals = await goLiveDeals();
  const nextUp = deals
    .filter((d) => d.stageKind === "won")
    .sort((a, b) => (a.liveDate ?? "9999").localeCompare(b.liveDate ?? "9999") || a.name.localeCompare(b.name));
  const live = deals.filter((d) => d.stageKind !== "won");
  const shown = GO_LIVE_CHECKS.some((c) => c.key === waiting) ? nextUp.filter((d) => d.checks.some((c) => c.key === waiting && !c.confirmed)) : nextUp;
  const today = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const ready = nextUp.filter((d) => d.checks.every((c) => c.confirmed)).length;

  return (
    <BoardFrame title="Next up" other={{ href: "/live", label: `Live board (${live.length})` }}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Won, not live yet" value={String(nextUp.length)} tone={nextUp.length ? "warn" : undefined} />
        <Stat label="Monthly to come (USD)" value={money(sumMonthly(nextUp))} tone={nextUp.length ? "up" : undefined} />
        <Stat label="Live date this week" value={String(nextUp.filter((d) => d.liveDate && new Date(d.liveDate).getTime() - today <= 7 * DAY).length)} />
        <Stat label="All handovers done" value={String(ready)} />
      </div>

      <section aria-label="Next up">
        <nav className="mb-2 flex flex-wrap gap-1 text-xs font-bold" aria-label="Waiting on">
          <span className="self-center pr-1 text-white/50 uppercase">Waiting on</span>
          {[{ key: "", label: "Everyone" }, ...GO_LIVE_CHECKS].map((c) => {
            const on = (waiting ?? "") === c.key;
            return (
              <Link key={c.key} href={c.key ? `/next-up?waiting=${c.key}` : "/next-up"} aria-current={on ? "page" : undefined}
                className={`rounded-full px-3 py-1 ${on ? "bg-brand text-ink" : "bg-white/10 text-white/80 hover:bg-white/20"}`}>
                {c.label}
              </Link>
            );
          })}
        </nav>
        {shown.length === 0 ? <Empty>{nextUp.length ? "Nothing waiting on that department." : "No won deals waiting to go live."}</Empty> : (
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-black text-left text-xs tracking-wider text-white/50 uppercase">
                <tr>
                  <th className="p-2.5">Deal</th><th className="p-2.5">Platform</th><th className="p-2.5">Live date</th><th className="p-2.5 text-right">Monthly</th>
                  {GO_LIVE_CHECKS.map((c) => <th key={c.key} className="p-2.5 text-center">{c.label}</th>)}
                  <th className="p-2.5 text-right">Done</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {shown.map((d) => {
                  const done = d.checks.filter((c) => c.confirmed).length;
                  const days = d.liveDate ? Math.round((new Date(d.liveDate).getTime() - today) / DAY) : null;
                  return (
                    <tr key={d.id} className="hover:bg-white/5">
                      <td className="p-2.5"><DealCell d={d} /></td>
                      <td className="p-2.5 text-white/80">{d.platform ?? "—"}</td>
                      <td className="p-2.5">
                        {d.liveDate ? (
                          <>
                            <span className="font-mono tabular-nums">{date(d.liveDate)}</span>
                            <span className={`block text-xs ${days! < 0 ? "text-amber-300" : "text-white/50"}`}>
                              {days === 0 ? "today" : days! > 0 ? `in ${days} ${days === 1 ? "day" : "days"}` : `${-days!} ${days === -1 ? "day" : "days"} late`}
                            </span>
                          </>
                        ) : <span className="text-white/40">not set</span>}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-brand tabular-nums">{money(d.amountMonthly)}</td>
                      {d.checks.map((c) => (
                        <td key={c.key} className="p-2.5 text-center">
                          {c.confirmed
                            ? <span className="inline-block rounded bg-brand px-2 py-0.5 font-mono text-xs font-bold text-ink" title={`Confirmed by ${c.confirmed.by}`}>✓ OK</span>
                            : <span className="inline-block rounded bg-amber-400/15 px-2 py-0.5 font-mono text-xs font-bold text-amber-300" title={`Waiting for ${c.teamNames}`}>WAIT</span>}
                        </td>
                      ))}
                      <td className={`p-2.5 text-right font-mono font-bold tabular-nums ${done === d.checks.length ? "text-brand" : "text-amber-300"}`}>{done}/{d.checks.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </BoardFrame>
  );
}
