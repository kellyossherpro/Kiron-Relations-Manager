import Link from "next/link";
import { addendumBoard } from "@/lib/addendums";
import { ADDENDUM_TYPE_LABEL, date, plural } from "@/lib/format";
import { requireActor } from "@/lib/session";

export const metadata = { title: "Addendums" };

// Every addendum in progress, oldest first: the account management team's to-do list
// until Asana (AM Mission Control) is connected.
export default async function AddendumsPage() {
  await requireActor();
  const { open, recent } = await addendumBoard();
  return (
    <div className="max-w-4xl space-y-5">
      <h1 className="h1">Addendums</h1>
      <p className="text-sm text-muted">
        Changes to money or the contract on live deals. Open the deal to mark an addendum as done: the deal goes back to Live by itself.
      </p>
      <section className="card p-5">
        <h2 className="h2 mb-3">In progress ({open.length})</h2>
        {open.length === 0 ? <p className="text-sm text-muted">Nothing in progress. Addendums raised on live deals show up here.</p> : (
          <ul className="divide-y divide-line">
            {open.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <Link href={`/deals/${a.dealId}`} className="font-bold hover:underline">{a.dealName}</Link>
                    <span className="pill ml-2 bg-warn-soft text-warn">{ADDENDUM_TYPE_LABEL[a.type] ?? a.type}</span>
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-line">{a.details}</p>
                  <p className="mt-1 text-xs text-muted">Raised by {a.raisedByName ?? "someone"} on {date(a.raisedAt)}</p>
                </div>
                <span className={`text-xs font-bold tabular-nums ${a.daysOpen >= 14 ? "text-danger" : "text-muted"}`}>
                  {a.daysOpen === 0 ? "Today" : `${plural(a.daysOpen, "day")} open`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {recent.length > 0 && (
        <section className="card p-5">
          <h2 className="h2 mb-3">Finished in the last 30 days</h2>
          <ul className="space-y-2">
            {recent.map((a) => (
              <li key={a.id} className="text-sm">
                <span className={`pill mr-2 ${a.status === "done" ? "bg-brand text-ink" : "bg-line text-ink"}`}>{a.status === "done" ? "Done" : "Cancelled"}</span>
                <Link href={`/deals/${a.dealId}`} className="font-bold hover:underline">{a.dealName}</Link>
                <span className="text-muted"> · {ADDENDUM_TYPE_LABEL[a.type] ?? a.type} · {date(a.closedAt)} by {a.closedByName ?? "someone"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
