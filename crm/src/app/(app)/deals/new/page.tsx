import Link from "next/link";
import { NewRecordForm } from "@/components/new-record-form";
import { CORE_FIELDS } from "@/lib/fields";
import { canCreate } from "@/lib/permissions";
import { companyOptions, listUsers } from "@/lib/queries";
import { requireActor } from "@/lib/session";

export const metadata = { title: "New deal" };

export default async function NewDealPage() {
  const actor = await requireActor();
  if (!canCreate(actor)) return <p>Your role can view deals but not add them.</p>;
  const [companies, users] = await Promise.all([companyOptions(), listUsers()]);
  const fields = CORE_FIELDS.deal.filter((f) => f.key !== "ownerId").map((f) => ({ ...f, editable: true }));
  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/deals" className="text-sm font-bold text-muted hover:text-ink">← Deals</Link>
      <h1 className="h1">New deal</h1>
      <p className="text-sm text-muted">It starts at the first stage and you&apos;re its owner. You can add contacts and everything else on the next page.</p>
      {companies.length === 0 && (
        <p className="text-sm">No companies yet. <Link href="/companies/new" className="font-bold text-brand-dark underline">Add the company first</Link>, or create the deal now and link it later.</p>
      )}
      <NewRecordForm objectType="deal" fields={fields} lookups={{ companies, users: users.map((u) => ({ id: u.id, label: u.name })) }} submitLabel="Create deal" />
    </div>
  );
}
