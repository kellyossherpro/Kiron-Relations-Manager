import Link from "next/link";
import { money, plural } from "@/lib/format";
import { requireActor } from "@/lib/session";
import { dealSummary, type Totals } from "@/lib/summary";

export const metadata = { title: "Summary" };

// What the deals are worth: all of them, each stage, each deal. Value = the anticipated monthly
// amount (USD); a year is 12 months of it.
export default async function SummaryPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  await requireActor();
  const { stage } = await searchParams;
  const { stages, deals, totals } = await dealSummary();
  const shown = stage ? deals.filter((d) => d.stageKey === stage) : deals;
  const shownTotal = shown.reduce((s, d) => s + (d.monthly ?? 0), 0);
  const biggest = Math.max(1, ...stages.map((s) => s.monthly));
  const closed = new Set(["lost", "terminated"]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Summary</h1>
        <p className="mt-1 text-sm text-muted">What the deals are worth, using each deal&rsquo;s anticipated monthly amount (USD). A year is 12 months of it.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="All active deals" t={totals.active} strong />
        <Tile label="Being sold" t={totals.selling} />
        <Tile label="Next up (won, not live)" t={totals.nextUp} />
        <Tile label="Live" t={totals.live} />
      </div>
      {(totals.onHold.count > 0 || totals.closed.count > 0) && (
        <p className="-mt-3 text-xs text-muted">
          {totals.onHold.count > 0 && <>All active deals also includes {plural(totals.onHold.count, "deal")} on hold ({money(totals.onHold.monthly)} a month). </>}
          {totals.closed.count > 0 && <>Not counted: {plural(totals.closed.count, "lost or ended deal")} ({money(totals.closed.monthly)} a month).</>}
        </p>
      )}

      <section className="card p-5" aria-label="By stage">
        <h2 className="h2 mb-3">By stage</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs tracking-wide text-muted uppercase">
              <tr><th className="py-2 pr-3">Stage</th><th className="py-2 pr-3 text-right">Deals</th><th className="w-[40%] py-2 pr-3">Monthly</th><th className="py-2 text-right">A year</th></tr>
            </thead>
            <tbody>
              {stages.map((s) => (
                <tr key={s.key} className={`border-t border-line ${closed.has(s.kind) ? "text-muted" : ""}`}>
                  <td className="py-2 pr-3">
                    <Link href={`/summary?stage=${s.key}#deals`} className="font-bold hover:underline">{s.label}</Link>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.count}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2" title={`${s.label}: ${money(s.monthly)} a month`}>
                      <span className="h-3 rounded-r-sm bg-brand" style={{ width: `${Math.max(s.monthly ? 2 : 0, (s.monthly / biggest) * 70)}%`, opacity: closed.has(s.kind) ? 0.35 : 1 }} aria-hidden="true" />
                      <span className="font-bold tabular-nums whitespace-nowrap">{money(s.monthly)}</span>
                    </div>
                  </td>
                  <td className="py-2 text-right tabular-nums">{money(s.monthly * 12)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5" aria-label="Every deal" id="deals">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="h2">{stage ? `Deals in ${stages.find((s) => s.key === stage)?.label ?? "this stage"}` : "Every deal"}</h2>
          <p className="text-sm text-muted">{plural(shown.length, "deal")} · <strong className="text-ink">{money(shownTotal)}</strong> a month · {money(shownTotal * 12)} a year</p>
        </div>
        <nav className="mb-3 flex flex-wrap gap-1 text-xs font-bold" aria-label="Show stage">
          <Link href="/summary#deals" aria-current={!stage ? "page" : undefined} className={`rounded-full px-3 py-1 ${!stage ? "bg-ink text-white" : "bg-paper hover:bg-line"}`}>All</Link>
          {stages.filter((s) => s.count > 0).map((s) => (
            <Link key={s.key} href={`/summary?stage=${s.key}#deals`} aria-current={stage === s.key ? "page" : undefined}
              className={`rounded-full px-3 py-1 ${stage === s.key ? "bg-ink text-white" : "bg-paper hover:bg-line"}`}>{s.label} ({s.count})</Link>
          ))}
        </nav>
        {shown.length === 0 ? <p className="text-sm text-muted">No deals here.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="text-left text-xs tracking-wide text-muted uppercase">
                <tr><th className="py-2 pr-3">Deal</th><th className="py-2 pr-3">Stage</th><th className="py-2 pr-3">Owner</th><th className="py-2 pr-3 text-center">Priority</th><th className="py-2 pr-3 text-right">Monthly</th><th className="py-2 text-right">A year</th></tr>
              </thead>
              <tbody>
                {shown.map((d) => (
                  <tr key={d.id} className="border-t border-line">
                    <td className="py-2 pr-3">
                      <Link href={`/deals/${d.id}`} className="font-bold text-brand-dark hover:underline">{d.name}</Link>
                      {d.companyName && <span className="block text-xs text-muted">{d.companyName}</span>}
                    </td>
                    <td className="py-2 pr-3"><span className="pill bg-paper text-ink">{d.stageLabel}</span></td>
                    <td className="py-2 pr-3">{d.ownerName ?? "—"}</td>
                    <td className="py-2 pr-3 text-center tabular-nums">{d.priority ?? "—"}</td>
                    <td className="py-2 pr-3 text-right font-bold tabular-nums">{d.monthly === null ? <span className="font-normal text-muted">not set</span> : money(d.monthly)}</td>
                    <td className="py-2 text-right tabular-nums">{d.monthly === null ? "—" : money(d.monthly * 12)}</td>
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

function Tile({ label, t, strong }: { label: string; t: Totals; strong?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${strong ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>
      <p className={`text-xs font-bold tracking-wide uppercase ${strong ? "text-white/70" : "text-muted"}`}>{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums">{money(t.monthly)}<span className={`text-sm font-bold ${strong ? "text-white/70" : "text-muted"}`}> /mo</span></p>
      <p className={`text-xs tabular-nums ${strong ? "text-white/70" : "text-muted"}`}>{plural(t.count, "deal")} · {money(t.monthly * 12)} a year</p>
    </div>
  );
}
