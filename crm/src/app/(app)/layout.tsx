import Link from "next/link";
import { signOutAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { NavLink } from "@/components/nav-link";
import { ROLE_LABEL } from "@/lib/format";
import { requireActor } from "@/lib/session";
import { unreadCount } from "@/lib/stage-rules-admin";
import { openAddendumCount } from "@/lib/addendums";
import { signOffsWaiting } from "@/lib/stage-engine";
import { goLiveWaiting } from "@/lib/go-live";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const [unread, addendums, signOffs, handovers] = await Promise.all([
    unreadCount(actor.id), openAddendumCount(), signOffsWaiting(actor.teamIds ?? []), goLiveWaiting(actor.teamIds ?? []),
  ]);
  const waiting = signOffs.length + handovers.length;
  return (
    <AppShell
      brand={
        <Link href="/live" aria-label="KRM home" className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/krm-icon.png" alt="" className="h-12 w-12 shrink-0" />
          <span className="min-w-0 leading-tight">
            <span className="block text-2xl font-black tracking-tight text-white">KRM</span>
            <span className="block text-[9px] font-bold tracking-[0.08em] whitespace-nowrap text-brand uppercase">Kiron Relations Manager</span>
          </span>
        </Link>
      }
      nav={
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3">
          <NavLink href="/live">Live board</NavLink>
          <NavLink href="/next-up">Next up</NavLink>
          <NavLink href="/priorities">Priorities</NavLink>
          <NavLink href="/summary">Summary</NavLink>
          <span className="mx-3 my-1 border-t border-white/10" aria-hidden="true" />
          <NavLink href="/deals">Deals</NavLink>
          <NavLink href="/companies">Companies</NavLink>
          <NavLink href="/contacts">Contacts</NavLink>
          <NavLink href="/tasks">
            My tasks
            {waiting > 0 && <span className="ml-auto rounded-full bg-warn-soft px-2 text-xs text-warn tabular-nums" aria-label={`${waiting} sign-offs and handovers waiting`}>{waiting}</span>}
          </NavLink>
          <NavLink href="/addendums">
            Addendums
            {addendums > 0 && <span className="ml-auto rounded-full bg-warn-soft px-2 text-xs text-warn tabular-nums" aria-label={`${addendums} in progress`}>{addendums}</span>}
          </NavLink>
          <NavLink href="/notifications">
            Notifications
            {unread > 0 && <span className="ml-auto rounded-full bg-white px-2 text-xs text-ink tabular-nums" aria-label={`${unread} unread`}>{unread}</span>}
          </NavLink>
          {actor.role === "admin" && <NavLink href="/admin">Admin</NavLink>}
        </nav>
      }
      account={
        <div className="border-t border-white/10 px-5 py-4">
          <p className="text-sm font-bold text-white">{actor.name}</p>
          <p className="text-xs text-white/60">{ROLE_LABEL[actor.role]}</p>
          <form action={signOutAction} className="mt-3">
            <button className="text-xs font-bold text-brand uppercase hover:underline">Sign out</button>
          </form>
        </div>
      }
      header={
        <>
          <form action="/search" className="min-w-0 flex-1">
            <label htmlFor="global-search" className="sr-only">Search</label>
            <input id="global-search" name="q" placeholder="Search deals, companies and contacts" className="input max-w-xl" />
          </form>
        </>
      }
    >
      {children}
    </AppShell>
  );
}
