import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { date, money } from "@/lib/format";
import { GO_LIVE_CHECKS, goLiveDeals, type GoLiveDeal } from "@/lib/go-live";
import { requireActor } from "@/lib/session";

export const metadata = { title: "Live board" };

const DAY = 86_400_000;

// Every live client, and the won deals on their way, like a stock-market board (Q53, Q65).
// Everyone signed in sees it; "Waiting on" narrows the deals going live to one department.
export default async function LiveBoardPage({ searchParams }: { searchParams: Promise<{ waiting?: string }> }) {
  await requireActor();
  const { waiting } = await searchParams;
  const deals = await goLiveDeals();
  const goingLive = deals.filter((d) => d.stageKind === "won");
  const live = deals.filter((d) => d.stageKind !== "won").sort((a, b) => sinceOf(b) - sinceOf(a));
  const shownGoing = GO_LIVE_CHECKS.some((c) => c.key === waiting)
    ? goingLive.filter((d) => d.checks.some((c) => c.key === waiting && !c.confirmed))
    : goingLive;
  const now = new Date().getTime();
  const monthly = live.reduce((sum, d) => sum + (Number(d.amountMonthly) || 0), 0);
  const recent = live.filter((d) => now - sinceOf(d) <= 30 * DAY).length;

  return (
    <div className="space-y-5 rounded-2xl bg-ink p-4 text-white sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black tracking-tight uppercase">Live board</h1>
        <AutoRefresh seconds={30} />
      </div>

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
        <Stat label="Going live" value={String(goingLive.length)} tone={goingLive.length ? "warn" : undefined} />
        <Stat label="Live monthly (USD)" value={money(monthly)} />
        <Stat label="Went live, last 30 days" value={String(recent)} tone={recent ? "up" : undefined} />
      </div>

      <section aria-label="Going live">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-black tracking-wider uppercase">Going live</h2>
          <nav className="flex flex-wrap gap-1 text-xs font-bold" aria-label="Waiting on">
            <span className="self-center pr-1 text-white/50 uppercase">Waiting on</span>
            {[{ key: "", label: "Everyone" }, ...GO_LIVE_CHECKS].map((c) => {
              const on = (waiting ?? "") === c.key;
              return (
                <Link key={c.key} href={c.key ? `/live?waiting=${c.key}` : "/live"} aria-current={on ? "page" : undefined}
                  className={`rounded-full px-3 py-1 ${on ? "bg-brand text-ink" : "bg-white/10 text-white/80 hover:bg-white/20"}`}>
                  {c.label}
                </Link>
              );
            })}
          </nav>
        </div>
        {shownGoing.length === 0 ? (
          <p className="rounded-lg bg-white/5 p-4 text-sm text-white/60">{goingLive.length ? "Nothing waiting on that department." : "No won deals waiting to go live."}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="bg-black text-left text-xs tracking-wider text-white/50 uppercase">
                <tr>
                  <th className="p-2.5">Deal</th><th className="p-2.5">Platform</th><th className="p-2.5">Live date</th>
                  {GO_LIVE_CHECKS.map((c) => <th key={c.key} className="p-2.5 text-center">{c.label}</th>)}
                  <th className="p-2.5 text-right">Done</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {shownGoing.map((d) => {
                  const done = d.checks.filter((c) => c.confirmed).length;
                  return (
                    <tr key={d.id} className="hover:bg-white/5">
                      <td className="p-2.5"><DealCell d={d} /></td>
                      <td className="p-2.5 text-white/80">{d.platform ?? "—"}</td>
                      <td className="p-2.5 font-mono tabular-nums">{d.liveDate ? date(d.liveDate) : <span className="text-white/40">not set</span>}</td>
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

      <section aria-label="Live">
        <h2 className="mb-2 text-sm font-black tracking-wider uppercase">Live</h2>
        {live.length === 0 ? <p className="rounded-lg bg-white/5 p-4 text-sm text-white/60">No live clients yet.</p> : (
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
    </div>
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

function DealCell({ d }: { d: GoLiveDeal }) {
  return (
    <Link href={`/deals/${d.id}`} className="group block">
      <span className="font-bold text-white group-hover:text-brand group-hover:underline">{d.name}</span>
      {d.companyName && <span className="block text-xs text-white/50">{d.companyName}</span>}
    </Link>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "warn" }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black p-3">
      <p className="text-xs font-bold tracking-wider text-white/50 uppercase">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold tabular-nums ${tone === "up" ? "text-brand" : tone === "warn" ? "text-amber-300" : "text-white"}`}>
        {tone === "up" && "▲ "}{value}
      </p>
    </div>
  );
}
