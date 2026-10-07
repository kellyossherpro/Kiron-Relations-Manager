import { connection } from "next/server";
import { redirect } from "next/navigation";
import { signInAction } from "@/app/actions";
import { listUsers } from "@/lib/queries";
import { devAuthEnabled, hasAnyUsers } from "@/lib/session";

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
      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.id}>
            <form action={signInAction.bind(null, u.id)}>
              <button className="btn-ghost w-full justify-between">
                <span>{u.name}</span>
                <span className="text-xs font-semibold text-muted">{ROLE_LABEL[u.role] ?? u.role}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
