import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityPanel } from "@/components/activity-panel";
import { DeleteRecord } from "@/components/delete-record";
import { HistoryList } from "@/components/history-list";
import { LinkAdder, UnlinkButton } from "@/components/link-adder";
import { RecordFields } from "@/components/record-fields";
import { NotFoundError } from "@/lib/errors";
import { DEAL_CONTACT_ROLE_LABEL } from "@/lib/format";
import { canDelete, canEditRecord, canLogActivity, isManager } from "@/lib/permissions";
import { companyOptions, getContactRelations, getRecord, listActivities, listHistory, listStages, listUsers } from "@/lib/queries";
import { requireActor } from "@/lib/session";
import { clientFields } from "@/lib/view";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  let record;
  try {
    record = await getRecord("contact", id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { row, specs, values } = record;
  const [rel, users, companies, activities, history, stages] = await Promise.all([
    getContactRelations(id), listUsers(), companyOptions(), listActivities({ contactId: id }), listHistory("contact", id), listStages(),
  ]);
  const userOptions = users.map((u) => ({ id: u.id, label: u.name }));
  const canEdit = canEditRecord(actor, { ownerId: row.owner_id });
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
  const names = Object.fromEntries([...userOptions, ...companies].map((o) => [o.id, o.label]));

  return (
    <div className="space-y-5">
      <Link href="/contacts" className="text-sm font-bold text-muted hover:text-ink">← Contacts</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="h1">{name}</h1>
          <p className="mt-1 text-sm text-muted select-all">{[row.email, row.phone].filter(Boolean).join(" · ")}</p>
        </div>
        {canDelete(actor) && <DeleteRecord objectType="contact" id={id} label="contact" />}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <RecordFields objectType="contact" recordId={id} fields={clientFields(actor, "contact", row.owner_id, specs)} values={values} lookups={{ companies, users: userOptions }} />
          <ActivityPanel parent={{ contactId: id }} items={activities} users={userOptions} me={{ id: actor.id, isAdmin: isManager(actor) }} canLog={canLogActivity(actor)} />
        </div>
        <div className="min-w-0 space-y-5">
          <section className="card p-5" aria-label="Companies">
            <h2 className="h2 mb-3">Companies</h2>
            {rel.companies.length === 0 ? <p className="text-sm text-muted">Not linked to a company yet.</p> : (
              <ul className="space-y-2 text-sm">
                {rel.companies.map((c) => (
                  <li key={c.id} className={`flex items-start justify-between gap-2 ${c.isCurrent ? "" : "opacity-60"}`}>
                    <div>
                      <Link href={`/companies/${c.id}`} className="font-bold hover:underline">{c.name}</Link>
                      <p className="text-xs text-muted">{[c.role, c.isCurrent ? "Current" : "Past"].filter(Boolean).join(" · ")}</p>
                    </div>
                    {canEdit && (c.isCurrent
                      ? <UnlinkButton kind="companyContactPast" a={c.id} b={id} label="Left" />
                      : <UnlinkButton kind="companyContactCurrent" a={c.id} b={id} label="Back" />)}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && <LinkAdder kind="companyContact" ownerId={id} flip options={companies} placeholder="Type a company name" roleFreeText buttonLabel="Add company" />}
          </section>
          <section className="card p-5" aria-label="Deals">
            <h2 className="h2 mb-3">Deals</h2>
            {rel.deals.length === 0 ? <p className="text-sm text-muted">Not on any deals.</p> : (
              <ul className="space-y-2 text-sm">
                {rel.deals.map((d) => (
                  <li key={`${d.id}-${d.role}`}>
                    <Link href={`/deals/${d.id}`} className="font-bold hover:underline">{d.name}</Link>
                    <p className="text-xs text-muted">{d.stageLabel} · {DEAL_CONTACT_ROLE_LABEL[d.role] ?? d.role}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <details className="card p-5">
            <summary className="h2 cursor-pointer">History</summary>
            <div className="mt-3">
              <HistoryList entries={history} labels={Object.fromEntries(specs.map((s) => [s.key, s.label]))} stageLabels={Object.fromEntries(stages.map((s) => [s.key, s.label]))} names={names} />
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
