"use client";

import { useState } from "react";

const COOKIE = "krm_nav";

// The page frame: the menu on the left can be folded away so the page uses the whole width, and an
// arrow brings it back. The choice is remembered (a cookie, so the page opens the same way next time).
export function AppShell({ initialCollapsed, brand, nav, account, header, children }: {
  initialCollapsed: boolean;
  brand: React.ReactNode;
  nav: React.ReactNode;
  account: React.ReactNode;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  function toggle(next: boolean) {
    setCollapsed(next);
    document.cookie = `${COOKIE}=${next ? "closed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  }
  return (
    <div className="min-h-screen lg:flex">
      {!collapsed && (
        <aside className="bg-black lg:fixed lg:inset-y-0 lg:flex lg:w-60 lg:flex-col" aria-label="Menu">
          <div className="relative flex items-center justify-between gap-3 px-4 py-4 lg:block lg:px-4 lg:pt-6 lg:pb-5">
            {brand}
            <button
              type="button"
              onClick={() => toggle(true)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white lg:absolute lg:top-2 lg:right-2"
              aria-label="Hide the menu"
              title="Hide the menu"
            >
              <Chevron dir="left" />
            </button>
          </div>
          {nav}
          {account}
        </aside>
      )}
      <div className={`min-w-0 flex-1 ${collapsed ? "" : "lg:pl-60"}`}>
        <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur" style={{ top: "env(safe-area-inset-top, 0px)" }}>
          <div className={`mx-auto flex items-center gap-3 px-4 py-3 lg:px-8 ${collapsed ? "" : "max-w-6xl"}`}>
            {collapsed && (
              <button
                type="button"
                onClick={() => toggle(false)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-black px-2.5 py-2 text-xs font-bold tracking-wide text-white uppercase hover:bg-ink"
                aria-label="Show the menu"
                title="Show the menu"
              >
                <Chevron dir="right" /> Menu
              </button>
            )}
            {header}
          </div>
        </header>
        <main className={`mx-auto px-4 py-6 lg:px-8 ${collapsed ? "" : "max-w-6xl"}`}>{children}</main>
      </div>
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"} />
    </svg>
  );
}
