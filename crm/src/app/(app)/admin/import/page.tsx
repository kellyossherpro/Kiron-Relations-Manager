import Link from "next/link";
import { ImportWizard } from "@/components/import-wizard";
import { db } from "@/db";
import { listImports, rememberedMapping } from "@/lib/import/run";
import { canManageUsersAndFields } from "@/lib/permissions";
import { listStages } from "@/lib/queries";
import { loadSpecs } from "@/lib/records";
import { requireActor } from "@/lib/session";

export const metadata = { title: "Bring in from HubSpot" };

export default async function ImportPage() {
  const actor = await requireActor();
  if (!canManageUsersAndFields(actor)) return <p>Only admins can see this page.</p>;
  const [company, contact, deal, stages, past, rc, rk, rd] = await Promise.all([
    loadSpecs(db, "company"), loadSpecs(db, "contact"), loadSpecs(db, "deal"), listStages(), listImports(),
    rememberedMapping("company"), rememberedMapping("contact"), rememberedMapping("deal"),
  ]);
  return (
    <div className="max-w-5xl space-y-5">
      <Link href="/admin" className="text-sm font-bold text-muted hover:text-ink">← Admin</Link>
      <div>
        <h1 className="h1">Bring in from HubSpot</h1>
        <p className="mt-1 text-sm text-muted">
          Export from HubSpot, then bring the file in here. Records keep their HubSpot Record ID, so running it again later updates them
          instead of making copies. Deals come in at the stage they&rsquo;re at: nothing moves, nobody is notified.
        </p>
      </div>
      <ImportWizard
        specs={{ company, contact, deal }}
        stages={stages.filter((s) => s.kind !== "change").map((s) => ({ key: s.key, label: s.label }))}
        remembered={{ company: rc, contact: rk, deal: rd }}
        past={past}
      />
    </div>
  );
}
