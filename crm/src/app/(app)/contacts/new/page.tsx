import Link from "next/link";
import { NewRecordForm } from "@/components/new-record-form";
import { CORE_FIELDS } from "@/lib/fields";
import { canCreate } from "@/lib/permissions";
import { requireActor } from "@/lib/session";

export const metadata = { title: "New contact" };

export default async function NewContactPage() {
  const actor = await requireActor();
  if (!canCreate(actor)) return <p>Your role can view contacts but not add them.</p>;
  const fields = CORE_FIELDS.contact.filter((f) => f.key !== "ownerId").map((f) => ({ ...f, editable: true }));
  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/contacts" className="text-sm font-bold text-muted hover:text-ink">← Contacts</Link>
      <h1 className="h1">New contact</h1>
      <p className="text-sm text-muted">A contact needs at least an email address or a phone number. You can link them to companies on the next page.</p>
      <NewRecordForm objectType="contact" fields={fields} lookups={{ companies: [], users: [] }} submitLabel="Create contact" />
    </div>
  );
}
