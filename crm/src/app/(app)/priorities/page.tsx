import Link from "next/link";
import { PriorityAdd, PriorityRowControls } from "@/components/priority-controls";
import { money, plural } from "@/lib/format";
import { canSetPriority } from "@/lib/permissions";
import { dealsWithoutPriority, listPriorities } from "@/lib/priorities";
import { requireActor } from "@/lib/session";

export const metadata = { title: "Priorities" };

// The company's deal ranking: 1 is the most important, each number belongs to one deal.
export default async function PrioritiesPage() {
  const actor = await requireActor();
  const can = canSetPriority(actor);
  const [rows, open] = await Promise.all([listPriorities(), can ? dealsWithoutPriority() : Promise.resolve([])]);
  const total = rows.reduce((s, r) => s + (Number(r.amountMonthly) || 0), 0);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Priorities</h1>
          <p className="mt-1 text-sm text-muted">
            1 is the most important. Each number belongs to one deal{can ? ": use the arrows to move a deal up or down, or set its number on the deal itself" : ""}.
          </p>
        </div>
        {rows.length > 0 && <p className="text-sm text-muted">{plural(rows.length, "deal")} · <strong className="text-ink">{money(total)}</strong> a month</p>}
      </div>

      {can && <PriorityAdd deals={open} taken={rows.map((r) => r.priority)} />}

      {rows.length === 0 ? (
        <section className="card p-6 text-sm text-muted">
          <p className="font-bold text-ink">No deals have a priority yet.</p>
          <p>{can ? "Add one above, or open a deal and pick its priority under the name." : "A manager or admin sets them."}</p>
        </section>
      ) : (
        <section className="card overflow-x-auto" aria-label="Priority list">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b border-line text-left text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="w-16 p-3">#</th><th className="p-3">Deal</th><th className="p-3">Stage</th><th className="p-3">Owner</th>
                <th className="p-3 text-right">Monthly</th><th className="p-3 text-right">In stage</th>{can && <th className="p-3"><span className="sr-only">Move</span></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="p-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-ink font-black text-white tabular-nums">{r.priority}</span></td>
                  <td className="p-3">
                    <Link href={`/deals/${r.id}`} className="font-bold text-brand-dark hover:underline">{r.name}</Link>
                    {r.companyName && <span className="block text-xs text-muted">{r.companyName}</span>}
                  </td>
                  <td className="p-3"><span className="pill bg-paper text-ink">{r.stageLabel}</span></td>
                  <td className="p-3">{r.ownerName ?? "—"}</td>
                  <td className="p-3 text-right font-bold tabular-nums">{money(r.amountMonthly)}</td>
                  <td className="p-3 text-right text-muted tabular-nums">{plural(r.daysInStage, "day")}</td>
                  {can && <td className="p-3 text-right"><PriorityRowControls dealId={r.id} name={r.name} first={i === 0} last={i === rows.length - 1} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
