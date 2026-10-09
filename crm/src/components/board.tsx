import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import type { GoLiveDeal } from "@/lib/go-live";

// Shared pieces of the stock-market style boards (Live board, Next up).

export const DAY = 86_400_000;

export function BoardFrame({ title, other, children }: { title: string; other: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <div className="space-y-5 rounded-2xl bg-ink p-4 text-white sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-2xl font-black tracking-tight uppercase">{title}</h1>
          <Link href={other.href} className="text-xs font-bold tracking-wider text-white/60 uppercase hover:text-brand">{other.label} →</Link>
        </div>
        <AutoRefresh seconds={30} />
      </div>
      {children}
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "warn" }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black p-3">
      <p className="text-xs font-bold tracking-wider text-white/50 uppercase">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold tabular-nums ${tone === "up" ? "text-brand" : tone === "warn" ? "text-amber-300" : "text-white"}`}>
        {tone === "up" && "▲ "}{value}
      </p>
    </div>
  );
}

export function DealCell({ d }: { d: GoLiveDeal }) {
  return (
    <Link href={`/deals/${d.id}`} className="group block">
      <span className="font-bold text-white group-hover:text-brand group-hover:underline">{d.name}</span>
      {d.companyName && <span className="block text-xs text-white/50">{d.companyName}</span>}
    </Link>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-white/5 p-4 text-sm text-white/60">{children}</p>;
}

export const sumMonthly = (deals: GoLiveDeal[]) => deals.reduce((sum, d) => sum + (Number(d.amountMonthly) || 0), 0);
