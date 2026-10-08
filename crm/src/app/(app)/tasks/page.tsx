import Link from "next/link";
import { TaskToggle } from "@/components/task-toggle";
import { date } from "@/lib/format";
import { myOpenTasks } from "@/lib/queries";
import { requireActor } from "@/lib/session";
import { signOffsWaiting } from "@/lib/stage-engine";

export const metadata = { title: "My tasks" };

export default async function TasksPage() {
  const actor = await requireActor();
  const [tasks, signOffs] = await Promise.all([myOpenTasks(actor.id), signOffsWaiting(actor.teamIds ?? [])]);
  const open = tasks.filter((t) => !t.completedAt);
  const done = tasks.filter((t) => t.completedAt);
  const now = new Date();
  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="h1">My tasks</h1>
      {signOffs.length > 0 && (
        <section className="card border-warn/40 p-5" aria-label="Waiting for your sign-off">
          <h2 className="h2 mb-1">Waiting for your sign-off ({signOffs.length})</h2>
          <p className="mb-3 text-sm text-muted">These deals can&rsquo;t move on until someone in your group signs them off. Open the deal, then Edit.</p>
          <ul className="space-y-2">
            {signOffs.map((s) => (
              <li key={`${s.dealId}-${s.label}`} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2 text-sm last:border-0">
                <span>
                  <Link href={`/deals/${s.dealId}`} className="font-bold text-brand-dark hover:underline">{s.dealName}</Link>
                  <span className="text-muted"> · {s.label}</span>
                </span>
                <span className="text-xs text-muted">{s.stageLabel} since {date(s.since)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card p-5">
        <h2 className="h2 mb-3">To do ({open.length})</h2>
        {open.length === 0 ? <p className="text-sm text-muted">Nothing to do. Tasks you add on a deal, company or contact show up here.</p> : (
          <ul className="space-y-3">
            {open.map((t) => {
              const overdue = t.dueAt && new Date(t.dueAt) < now;
              const href = t.dealId ? `/deals/${t.dealId}` : t.companyId ? `/companies/${t.companyId}` : `/contacts/${t.contactId}`;
              return (
                <li key={t.id} className="flex gap-3 border-b border-line pb-3 last:border-0">
                  <TaskToggle id={t.id} done={false} label={t.subject} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{t.subject}</p>
                    <p className="text-xs text-muted">
                      <span className={overdue ? "font-bold text-danger" : ""}>{t.dueAt ? `Due ${date(t.dueAt)}${overdue ? " · overdue" : ""}` : "No due date"}</span>
                      {" · "}<Link href={href} className="font-bold text-brand-dark hover:underline">{t.dealName ?? t.companyName ?? t.contactName}</Link>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {done.length > 0 && (
        <section className="card p-5">
          <h2 className="h2 mb-3">Done in the last 7 days</h2>
          <ul className="space-y-2">
            {done.map((t) => (
              <li key={t.id} className="flex gap-3 text-sm text-muted">
                <TaskToggle id={t.id} done label={t.subject} />
                <span className="line-through">{t.subject}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
