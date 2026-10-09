"use client";

import { useEffect, useState } from "react";

// The page frame. Pages use the whole width; the menu slides out from the left when the Menu
// button is pressed, and closes again as soon as a page is picked (or on Esc, or a click beside it).
export function AppShell({ brand, nav, account, header, children }: {
  brand: React.ReactNode;
  nav: React.ReactNode;
  account: React.ReactNode;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="min-h-screen">
      {open && (
        <div className="fixed inset-0 z-40">
          <button type="button" className="absolute inset-0 h-full w-full cursor-default bg-ink/40" aria-label="Close the menu" onClick={() => setOpen(false)} />
          <aside
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-black shadow-2xl"
            style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            aria-label="Menu"
            onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}
          >
            <div className="relative px-4 pt-6 pb-5">
              {brand}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Close the menu"
                title="Close the menu"
              >
                <Chevron dir="left" />
              </button>
            </div>
            {nav}
            {account}
          </aside>
        </div>
      )}
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur" style={{ top: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 lg:px-8">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-black px-2.5 py-2 text-xs font-bold tracking-wide text-white uppercase hover:bg-ink"
            aria-label="Open the menu"
            aria-expanded={open}
            title="Open the menu"
          >
            <Chevron dir="right" /> Menu
          </button>
          {header}
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6 lg:px-8">{children}</main>
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
