"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Keeps a page up to date without anyone pressing refresh (the Live board on a wall screen).
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const [at, setAt] = useState<string | null>(null);
  useEffect(() => {
    const stamp = () => setAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    stamp();
    const t = setInterval(() => { router.refresh(); stamp(); }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return (
    <span className="flex items-center gap-2 text-xs font-bold tracking-wider text-white/70 uppercase">
      <span className="blink h-2 w-2 rounded-full bg-brand" aria-hidden />
      Live{at && <span className="font-mono text-white/50 tabular-nums">· updated {at}</span>}
    </span>
  );
}
