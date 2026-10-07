import Link from "next/link";
import { signOutAction } from "@/app/actions";
import { NavLink } from "@/components/nav-link";
import { ROLE_LABEL } from "@/lib/format";
import { requireActor } from "@/lib/session";
import { unreadCount } from "@/lib/stage-rules-admin";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const unread = await unreadCount(actor.id);
  return (
    <div className="min-h-screen lg:flex">
      <aside className="bg-black lg:fixed lg:inset-y-0 lg:flex lg:w-60 lg:flex-col">
        <div className="flex items-center justify-between gap-4 px-4 py-4 lg:block lg:px-5 lg:py-6">
          <Link href="/deals" aria-label="KRM home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/krm-logo-compact.png" alt="KRM" className="h-9 w-auto lg:h-auto lg:w-full" />
          </Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-3">
          <NavLink href="/deals">Deals</NavLink>
          <NavLink href="/companies">Companies</NavLink>
          <NavLink href="/contacts">Contacts</NavLink>
          <NavLink href="/tasks">My tasks</NavLink>
          <NavLink href="/notifications">
            Notifications
            {unread > 0 && <span className="ml-auto rounded-full bg-white px-2 text-xs text-ink tabular-nums" aria-label={`${unread} unread`}>{unread}</span>}
          </NavLink>
          {actor.role === "admin" && <NavLink href="/admin">Admin</NavLink>}
        </nav>
        <div className="hidden border-t border-white/10 px-5 py-4 lg:block">
          <p className="text-sm font-bold text-white">{actor.name}</p>
          <p className="text-xs text-white/60">{ROLE_LABEL[actor.role]}</p>
          <form action={signOutAction} className="mt-3">
            <button className="text-xs font-bold text-brand uppercase hover:underline">Sign out</button>
          </form>
        </div>
      </aside>
      <div className="flex-1 lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 lg:px-8">
            <form action="/search" className="flex-1">
              <label htmlFor="global-search" className="sr-only">Search</label>
              <input id="global-search" name="q" placeholder="Search deals, companies and contacts" className="input max-w-xl" />
            </form>
            <form action={signOutAction} className="lg:hidden">
              <button className="text-xs font-bold text-muted uppercase">Sign out</button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
