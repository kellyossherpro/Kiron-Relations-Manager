import Link from "next/link";
import { canCreate } from "@/lib/permissions";
import { listContacts } from "@/lib/queries";
import { requireActor } from "@/lib/session";

export const metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requireActor();
  const { q } = await searchParams;
  const contacts = await listContacts(q);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Contacts</h1>
        <div className="flex gap-2">
          <form>
            <label htmlFor="contact-q" className="sr-only">Filter contacts</label>
            <input id="contact-q" name="q" defaultValue={q} placeholder="Filter by name, email or phone" className="input w-64" />
          </form>
          {canCreate(actor) && <Link href="/contacts/new" className="btn-primary">New contact</Link>}
        </div>
      </div>
      {contacts.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-lg font-black uppercase">{q ? "No matches" : "No contacts yet"}</p>
          {!q && canCreate(actor) && <Link href="/contacts/new" className="btn-primary mt-4">Add the first contact</Link>}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs tracking-wide text-muted uppercase">
              <tr><th className="p-3">Name</th><th className="p-3">Company</th><th className="p-3">Email</th><th className="p-3">Phone</th></tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0 hover:bg-paper">
                  <td className="p-3"><Link href={`/contacts/${c.id}`} className="font-bold hover:underline">{c.name}</Link>{c.jobTitle && <span className="block text-xs text-muted">{c.jobTitle}</span>}</td>
                  <td className="p-3">{c.companies ?? "—"}</td>
                  <td className="p-3 select-all">{c.email ?? "—"}</td>
                  <td className="p-3 select-all">{c.phone ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
