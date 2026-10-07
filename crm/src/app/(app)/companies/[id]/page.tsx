import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityPanel } from "@/components/activity-panel";
import { DeleteRecord } from "@/components/delete-record";
import { HistoryList } from "@/components/history-list";
import { LinkAdder, UnlinkButton } from "@/components/link-adder";
import { RecordFields } from "@/components/record-fields";
import { NotFoundError } from "@/lib/errors";
import { money } from "@/lib/format";
import { canDelete, canEditRecord, canLogActivity, isManager } from "@/lib/permissions";
import { companyOptions, contactOptions, getCompanyRelations, getRecord, listActivities, listHistory, listStages, listUsers } from "@/lib/queries";
import { requireActor } from "@/lib/session";
import { clientFields } from "@/lib/view";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  let record;
  try {
    record = await getRecord("company", id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { row, specs, values } = record;
  const [rel, users, companies, contacts, activities, history, stages] = await Promise.all([
    getCompanyRelations(id), listUsers(), companyOptions(), contactOptions(), listActivities({ companyId: id }), listHistory("company", id), listStages(),
  ]);
  const userOptions = users.map((u) => ({ id: u.id, label: u.name }));
  const canEdit = canEditRecord(actor, { ownerId: row.owner_id });
  const parent = companies.find((c) => c.id === row.parent_id);
  const names = Object.fromEntries([...userOptions, ...companies].map((o) => [o.id, o.label]));

  return (
    <div className="space-y-5">
      <Link href="/companies" className="text-sm font-bold text-muted hover:text-ink">← Companies</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="h1">{String(row.name)}</h1>
          {parent && <p className="mt-1 text-sm text-muted">Part of <Link href={`/companies/${parent.id}`} className="font-bold hover:underline">{parent.label}</Link></p>}
        </div>
        <div className="flex gap-2">
          <Link href={`/deals/new`} className="btn-ghost">New deal</Link>
          {canDelete(actor) && <DeleteRecord objectType="company" id={id} label="company" />}
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <RecordFields objectType="company" recordId={id} fields={clientFields(actor, "company", row.owner_id, specs)} values={values}
            lookups={{ companies: companies.filter((c) => c.id !== id), users: userOptions }} />
          <ActivityPanel parent={{ companyId: id }} items={activities} users={userOptions} me={{ id: actor.id, isAdmin: isManager(actor) }} canLog={canLogActivity(actor)} />
        </div>
        <div className="min-w-0 space-y-5">
          <section className="card p-5" aria-label="Deals">
            <h2 className="h2 mb-3">Deals</h2>
            {rel.deals.length === 0 ? <p className="text-sm text-muted">No deals yet.</p> : (
              <ul className="space-y-2 text-sm">
                {rel.deals.map((d) => (
                  <li key={d.id}>
                    <Link href={`/deals/${d.id}`} className="font-bold hover:underline">{d.name}</Link>
                    <p className="text-xs text-muted">{d.stageLabel} · {d.relation}{d.amountMonthly ? ` · ${money(d.amountMonthly)}/mo` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card p-5" aria-label="Contacts">
            <h2 className="h2 mb-3">Contacts</h2>
            {rel.contacts.length === 0 ? <p className="text-sm text-muted">No contacts yet.</p> : (
              <ul className="space-y-2 text-sm">
                {rel.contacts.map((c) => (
                  <li key={c.id} className={`flex items-start justify-between gap-2 ${c.isCurrent ? "" : "opacity-60"}`}>
                    <div className="min-w-0">
                      <Link href={`/contacts/${c.id}`} className="font-bold hover:underline">{c.name}</Link>
                      <p className="text-xs text-muted">{[c.role, c.isCurrent ? null : "No longer here", c.email ?? c.phone].filter(Boolean).join(" · ")}</p>
                    </div>
                    {canEdit && (c.isCurrent
                      ? <UnlinkButton kind="companyContactPast" a={id} b={c.id} label="Mark as left" />
                      : <UnlinkButton kind="companyContactCurrent" a={id} b={c.id} label="Back" />)}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && <LinkAdder kind="companyContact" ownerId={id} options={contacts} placeholder="Type a contact's name" roleFreeText buttonLabel="Add contact" />}
            <Link href="/contacts/new" className="mt-2 block text-xs font-bold text-brand-dark hover:underline">Create a new contact</Link>
          </section>
          <details className="card p-5">
            <summary className="h2 cursor-pointer">History</summary>
            <div className="mt-3">
              <HistoryList entries={history} labels={Object.fromEntries(specs.map((s) => [s.key, s.label]))} stageLabels={Object.fromEntries(stages.map((s) => [s.key, s.label]))} names={names} moneyFields={specs.filter((s) => s.type === "money").map((s) => s.key)} />
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
