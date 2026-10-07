import Link from "next/link";
import { searchAll } from "@/lib/queries";
import { requireActor } from "@/lib/session";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireActor();
  const { q = "" } = await searchParams;
  const r = await searchAll(q);
  const total = r.deals.length + r.companies.length + r.contacts.length;
  return (
    <div className="space-y-5">
      <h1 className="h1">Search</h1>
      {!q.trim() ? <p className="text-sm text-muted">Type in the search box above.</p> : total === 0 ? (
        <p className="text-sm">Nothing found for &ldquo;{q}&rdquo;.</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-3">
          <Group title="Deals" items={r.deals.map((d) => ({ href: `/deals/${d.id}`, title: d.name, sub: d.companyName }))} />
          <Group title="Companies" items={r.companies.map((c) => ({ href: `/companies/${c.id}`, title: c.name, sub: c.website }))} />
          <Group title="Contacts" items={r.contacts.map((c) => ({ href: `/contacts/${c.id}`, title: c.name, sub: c.email ?? c.phone }))} />
        </div>
      )}
    </div>
  );
}

function Group({ title, items }: { title: string; items: { href: string; title: string; sub: string | null }[] }) {
  return (
    <section className="card p-5">
      <h2 className="h2 mb-3">{title} ({items.length})</h2>
      {items.length === 0 ? <p className="text-sm text-muted">None.</p> : (
        <ul className="space-y-2 text-sm">
          {items.map((i) => (
            <li key={i.href}><Link href={i.href} className="font-bold hover:underline">{i.title}</Link>{i.sub && <p className="text-xs text-muted">{i.sub}</p>}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
