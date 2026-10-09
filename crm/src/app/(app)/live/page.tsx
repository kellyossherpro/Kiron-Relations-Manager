import { BoardFrame, DAY, DealCell, Empty, Stat, sumMonthly } from "@/components/board";
import { date, money } from "@/lib/format";
import { goLiveDeals, type GoLiveDeal } from "@/lib/go-live";
import { requireActor } from "@/lib/session";

export const metadata = { title: "Live board" };

// Every live client, like a stock-market board (Q53, Q65). Won deals on their way are on Next up.
export default async function LiveBoardPage() {
  await requireActor();
  const deals = await goLiveDeals();
  const nextUp = deals.filter((d) => d.stageKind === "won");
  const live = deals.filter((d) => d.stageKind !== "won").sort((a, b) => sinceOf(b) - sinceOf(a));
  const now = new Date().getTime();
  const recent = live.filter((d) => now - sinceOf(d) <= 30 * DAY).length;

  return (
    <BoardFrame title="Live board" other={{ href: "/next-up", label: `Next up (${nextUp.length})` }}>
      {live.length > 0 && (
        <div className="-mx-4 overflow-hidden border-y border-white/10 bg-black py-2 sm:-mx-6" aria-label="Live clients ticker">
          <div className="ticker flex w-max gap-10 font-mono text-sm whitespace-nowrap">
            {[...live, ...live].map((d, i) => (
              <span key={`${d.id}-${i}`} aria-hidden={i >= live.length || undefined}>
                <span className="font-bold text-white">{d.name.toUpperCase()}</span>{" "}
                <span className="text-brand">▲ {money(d.amountMonthly)}/mo</span>{" "}
                <span className="text-white/50">{daysLive(d, now)}d live</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Live clients" value={String(live.length)} />
        <Stat label="Live monthly (USD)" value={money(sumMonthly(live))} />
        <Stat label="Went live, last 30 days" value={String(recent)} tone={recent ? "up" : undefined} />
        <Stat label="Next up" value={String(nextUp.length)} tone={nextUp.length ? "warn" : undefined} />
      </div>

      <section aria-label="Live">
        {live.length === 0 ? <Empty>No live clients yet.</Empty> : (
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="bg-black text-left text-xs tracking-wider text-white/50 uppercase">
                <tr>
                  <th className="p-2.5">Deal</th><th className="p-2.5">Platform</th><th className="p-2.5">Server</th><th className="p-2.5">Account manager</th>
                  <th className="p-2.5">Live since</th><th className="p-2.5 text-right">Days</th><th className="p-2.5 text-right">Monthly</th><th className="p-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {live.map((d) => (
                  <tr key={d.id} className="hover:bg-white/5">
                    <td className="p-2.5"><DealCell d={d} /></td>
                    <td className="p-2.5 text-white/80">{d.platform ?? "—"}</td>
                    <td className="p-2.5 text-white/80">{d.server ?? "—"}</td>
                    <td className="p-2.5 text-white/80">{d.ownerName ?? "—"}</td>
                    <td className="p-2.5 font-mono tabular-nums">{date(new Date(sinceOf(d)))}</td>
                    <td className="p-2.5 text-right font-mono tabular-nums">{daysLive(d, now)}</td>
                    <td className="p-2.5 text-right font-mono font-bold text-brand tabular-nums">{money(d.amountMonthly)}</td>
                    <td className="p-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${d.stageKind === "change" ? "bg-amber-400/15 text-amber-300" : "bg-brand/15 text-brand"}`}>
                        {d.stageKind === "change" ? "Addendum" : d.stageLabel.replace(/^Live\s*/i, "") || "Live"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </BoardFrame>
  );
}

// When the client went live: the Live date, unless the deal reached Live earlier than planned
// (a Live date still in the future). Deals brought in from HubSpot keep their real Live date.
function sinceOf(d: GoLiveDeal) {
  const reached = new Date(d.enteredStageAt).getTime();
  return d.liveDate ? Math.min(new Date(d.liveDate).getTime(), reached) : reached;
}

function daysLive(d: GoLiveDeal, now: number) {
  return Math.max(0, Math.floor((now - sinceOf(d)) / DAY));
}
