import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityPanel } from "@/components/activity-panel";
import { AddendumPanel } from "@/components/addendum-panel";
import { DeleteRecord } from "@/components/delete-record";
import { HistoryList } from "@/components/history-list";
import { LinkAdder, UnlinkButton } from "@/components/link-adder";
import { RecordFields } from "@/components/record-fields";
import { StageMover } from "@/components/stage-mover";
import { DEAL_CONTACT_ROLES } from "@/db/schema";
import { NotFoundError } from "@/lib/errors";
import { DEAL_CONTACT_ROLE_LABEL, plural } from "@/lib/format";
import { dealAddendums } from "@/lib/addendums";
import { canDelete, canEditRecord, canFinishAddendum, canLogActivity, canMoveStage, canRaiseAddendum, isManager } from "@/lib/permissions";
import { companyOptions, contactOptions, dealDaysInStage, getDealLinks, getRecord, listActivities, listHistory, listStages, listUsers } from "@/lib/queries";
import { requireActor } from "@/lib/session";
import { evaluateDeal } from "@/lib/stage-engine";
import { clientFields } from "@/lib/view";

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  let record;
  try {
    record = await getRecord("deal", id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { row, specs, values } = record;
  const [links, stages, users, companies, contacts, activities, history, daysInStage, evaluation, addendums] = await Promise.all([
    getDealLinks(id),
    listStages(),
    listUsers(),
    companyOptions(),
    contactOptions(),
    listActivities({ dealId: id }),
    listHistory("deal", id),
    dealDaysInStage(id),
    evaluateDeal(id),
    dealAddendums(id),
  ]);
  const collabIds = links.collaborators.map((c) => c.id);
  const ownerId = row.owner_id;
  const canEdit = canEditRecord(actor, { ownerId }, { collaboratorIds: collabIds });
  const allowedStages = stages.filter((s) => canMoveStage(actor, { ownerId }, s.key, { collaboratorIds: collabIds })).map((s) => s.key);
  const userOptions = users.map((u) => ({ id: u.id, label: u.name }));
  const lookups = { companies, users: userOptions };
  const stage = stages.find((s) => s.key === row.stage_key);
  const stageLabels = Object.fromEntries(stages.map((s) => [s.key, s.label]));
  const showAddendums = stage?.kind === "live" || stage?.kind === "change" || addendums.length > 0;
  const names = Object.fromEntries([...userOptions, ...companies].map((o) => [o.id, o.label]));

  return (
    <div className="space-y-5">
      <Link href="/deals" className="text-sm font-bold text-muted hover:text-ink">← Deals</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="h1">{String(row.name)}</h1>
          <p className="mt-1 text-sm text-muted">
            {stage?.label} · {plural(daysInStage, "day")} in this stage · Owner: {users.find((u) => u.id === ownerId)?.name ?? "nobody"}
          </p>
        </div>
        {canDelete(actor) && <DeleteRecord objectType="deal" id={id} label="deal" />}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <StageMover dealId={id} current={String(row.stage_key)} stages={stages} allowed={allowedStages} checklist={evaluation?.requirements ?? []} nextLabel={evaluation?.next?.label ?? null} />
          {showAddendums && (
            <AddendumPanel
              dealId={id}
              isLive={stage?.kind === "live"}
              liveLabel={stage?.kind === "live" ? stage.label : (stages.find((s) => s.kind === "live")?.label ?? "Live")}
              stageLabels={stageLabels}
              canRaise={canRaiseAddendum(actor, { ownerId }, { collaboratorIds: collabIds })}
              canFinish={canFinishAddendum(actor, { ownerId }, { collaboratorIds: collabIds })}
              items={addendums.map((a) => ({ ...a, raisedAt: String(a.raisedAt), closedAt: a.closedAt ? String(a.closedAt) : null }))}
            />
          )}
          <RecordFields objectType="deal" recordId={id} fields={clientFields(actor, "deal", ownerId, specs, collabIds)} values={values} lookups={lookups} />
          <ActivityPanel parent={{ dealId: id }} items={activities} users={userOptions} me={{ id: actor.id, isAdmin: isManager(actor) }} canLog={canLogActivity(actor)} />
        </div>

        <div className="min-w-0 space-y-5">
          <section className="card p-5" aria-label="Contacts on this deal">
            <h2 className="h2 mb-3">Contacts</h2>
            {links.contacts.length === 0 ? <p className="text-sm text-muted">No contacts yet.</p> : (
              <ul className="space-y-2">
                {links.contacts.map((c) => (
                  <li key={`${c.id}-${c.role}`} className="flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <Link href={`/contacts/${c.id}`} className="font-bold hover:underline">{c.name}</Link>
                      <p className="text-xs text-muted">{DEAL_CONTACT_ROLE_LABEL[c.role] ?? c.role}{c.email ? ` · ${c.email}` : ""}</p>
                    </div>
                    {canEdit && <UnlinkButton kind="dealContact" a={id} b={c.id} role={c.role} />}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <LinkAdder kind="dealContact" ownerId={id} options={contacts} placeholder="Type a contact's name"
                roles={DEAL_CONTACT_ROLES.map((r) => ({ value: r, label: DEAL_CONTACT_ROLE_LABEL[r] }))} buttonLabel="Add contact" />
            )}
          </section>

          <section className="card p-5" aria-label="Other companies on this deal">
            <h2 className="h2 mb-1">Other companies</h2>
            <p className="mb-3 text-xs text-muted">The contracting company and aggregator are in Details.</p>
            {links.companies.length === 0 ? <p className="text-sm text-muted">None.</p> : (
              <ul className="space-y-2">
                {links.companies.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-2 text-sm">
                    <div><Link href={`/companies/${c.id}`} className="font-bold hover:underline">{c.name}</Link>{c.role && <p className="text-xs text-muted">{c.role}</p>}</div>
                    {canEdit && <UnlinkButton kind="dealCompany" a={id} b={c.id} />}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && <LinkAdder kind="dealCompany" ownerId={id} options={companies} placeholder="Type a company name" roleFreeText buttonLabel="Add company" />}
          </section>

          <section className="card p-5" aria-label="Collaborators">
            <h2 className="h2 mb-3">Collaborators</h2>
            {links.collaborators.length === 0 ? <p className="text-sm text-muted">Only the owner works on this deal.</p> : (
              <ul className="space-y-2">
                {links.collaborators.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <span className="font-bold">{c.name}</span>
                    {(isManager(actor) || ownerId === actor.id) && <UnlinkButton kind="collaborator" a={id} b={c.id} />}
                  </li>
                ))}
              </ul>
            )}
            {(isManager(actor) || ownerId === actor.id) && (
              <LinkAdder kind="collaborator" ownerId={id} options={userOptions.filter((u) => u.id !== ownerId && !collabIds.includes(u.id))} placeholder="Type a name" buttonLabel="Add collaborator" />
            )}
          </section>

          <details className="card p-5">
            <summary className="h2 cursor-pointer">History</summary>
            <div className="mt-3">
              <HistoryList entries={history} labels={Object.fromEntries(specs.map((s) => [s.key, s.label]))} stageLabels={stageLabels} names={names} />
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
