import Link from "next/link";
import { COMPANY_TYPE_LABEL } from "@/lib/format";
import { canCreate } from "@/lib/permissions";
import { listCompanies } from "@/lib/queries";
import { requireActor } from "@/lib/session";

export const metadata = { title: "Companies" };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requireActor();
  const { q } = await searchParams;
  const companies = await listCompanies(q);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Companies</h1>
        <div className="flex gap-2">
          <form className="flex gap-2">
            <label htmlFor="company-q" className="sr-only">Filter companies</label>
            <input id="company-q" name="q" defaultValue={q} placeholder="Filter by name or website" className="input w-64" />
          </form>
          {canCreate(actor) && <Link href="/companies/new" className="btn-primary">New company</Link>}
        </div>
      </div>
      {companies.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-lg font-black uppercase">{q ? "No matches" : "No companies yet"}</p>
          {!q && canCreate(actor) && <Link href="/companies/new" className="btn-primary mt-4">Add the first company</Link>}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs tracking-wide text-muted uppercase">
              <tr><th className="p-3">Legal entity name</th><th className="p-3">Type</th><th className="p-3">Website</th><th className="p-3 text-right">Contacts</th><th className="p-3 text-right">Deals</th><th className="p-3">Owner</th></tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0 hover:bg-paper">
                  <td className="p-3"><Link href={`/companies/${c.id}`} className="font-bold hover:underline">{c.name}</Link>{c.tradingName && <span className="block text-xs text-muted">T/A {c.tradingName}</span>}</td>
                  <td className="p-3">{c.companyType ? COMPANY_TYPE_LABEL[c.companyType] : "—"}</td>
                  <td className="p-3">{c.website ? c.website.replace(/^https?:\/\//, "") : "—"}</td>
                  <td className="p-3 text-right tabular-nums">{c.contactCount}</td>
                  <td className="p-3 text-right tabular-nums">{c.dealCount}</td>
                  <td className="p-3">{c.ownerName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
