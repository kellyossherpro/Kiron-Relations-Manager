import Link from "next/link";
import { markAllReadAction } from "@/app/actions";
import { dateTime } from "@/lib/format";
import { requireActor } from "@/lib/session";
import { listNotifications } from "@/lib/stage-rules-admin";

export const metadata = { title: "Notifications" };

const KIND_LABEL: Record<string, string> = {
  stage_auto: "Moved on",
  stage_stale: "Stuck",
  on_hold_auto: "On hold",
  closed_lost_auto: "Closed lost",
  addendum_raised: "Addendum",
  addendum_done: "Addendum done",
  addendum_cancelled: "Addendum cancelled",
  handover_owner: "Handed over",
  signoff_needed: "Sign-off needed",
  handover_reminder: "Action needed",
};

export default async function NotificationsPage() {
  const actor = await requireActor();
  const items = await listNotifications(actor.id);
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Notifications</h1>
        {unread > 0 && (
          <form action={markAllReadAction}>
            <button className="btn-ghost">Mark all as read</button>
          </form>
        )}
      </div>
      <p className="text-sm text-muted">Everything KRM does by itself to your deals shows up here: deals moving on, deals that have been stuck for 30 days, deals moved to On Hold or Closed Lost, and addendums raised or finished on your deals.</p>
      {items.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">Nothing yet.</div>
      ) : (
        <ul className="card divide-y divide-line">
          {items.map((n) => (
            <li key={n.id} className={`flex gap-3 p-4 ${n.readAt ? "" : "bg-brand-soft/60"}`}>
              <span className={`pill h-fit ${n.kind === "stage_auto" ? "bg-brand text-ink" : n.kind === "stage_stale" || n.kind === "signoff_needed" ? "bg-warn-soft text-warn" : "bg-ink text-white"}`}>{KIND_LABEL[n.kind] ?? n.kind}</span>
              <div className="min-w-0 text-sm">
                <p className={n.readAt ? "" : "font-bold"}>{n.message}</p>
                <p className="text-xs text-muted">
                  {dateTime(n.createdAt)}
                  {n.dealId && <> · <Link href={`/deals/${n.dealId}`} className="font-bold text-brand-dark hover:underline">Open deal</Link></>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
