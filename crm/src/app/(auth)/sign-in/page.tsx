import { connection } from "next/server";
import { redirect } from "next/navigation";
import { listUsers } from "@/lib/queries";
import { devAuthEnabled, hasAnyUsers } from "@/lib/session";
import { PeopleList } from "./people-list";

export const metadata = { title: "Sign in" };

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin", manager: "Manager", sales: "Sales", account_manager: "Account manager", legal: "Legal", viewer: "Viewer",
};

export default async function SignInPage() {
  await connection(); // always check the database at request time
  if (!(await hasAnyUsers())) redirect("/setup");
  if (!devAuthEnabled()) {
    return <p className="text-sm">Sign-in isn&apos;t configured yet. Ask your admin.</p>;
  }
  const users = await listUsers();
  return (
    <div className="space-y-4">
      <h1 className="h1">Sign in</h1>
      <p className="text-sm text-muted">Test version: pick who you are. Before launch this becomes &ldquo;Sign in with Microsoft&rdquo;.</p>
      <PeopleList people={users.map(({ id, name, title, role }) => ({ id, name, title, role }))} roleLabels={ROLE_LABEL} />
    </div>
  );
}
