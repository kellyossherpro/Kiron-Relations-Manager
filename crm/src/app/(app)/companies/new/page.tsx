import Link from "next/link";
import { NewRecordForm } from "@/components/new-record-form";
import { CORE_FIELDS } from "@/lib/fields";
import { canCreate } from "@/lib/permissions";
import { companyOptions } from "@/lib/queries";
import { requireActor } from "@/lib/session";

export const metadata = { title: "New company" };

export default async function NewCompanyPage() {
  const actor = await requireActor();
  if (!canCreate(actor)) return <p>Your role can view companies but not add them.</p>;
  const companies = await companyOptions();
  const fields = CORE_FIELDS.company.filter((f) => f.key !== "ownerId").map((f) => ({ ...f, editable: true }));
  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/companies" className="text-sm font-bold text-muted hover:text-ink">← Companies</Link>
      <h1 className="h1">New company</h1>
      <p className="text-sm text-muted">Use the legal entity name. A website is needed for online companies; retail companies can leave it empty.</p>
      <NewRecordForm objectType="company" fields={fields} lookups={{ companies, users: [] }} submitLabel="Create company" />
    </div>
  );
}
