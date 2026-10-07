"use client";

import { useId, useMemo, useRef, useState } from "react";

export type Option = { id: string; label: string };

// A dropdown you can type into, for long lists like companies or contacts.
export function SearchSelect({
  id,
  options,
  value,
  onChange,
  placeholder = "Type to search",
  allowEmpty = true,
}: {
  id?: string;
  options: Option[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-list`;
  const selected = options.find((o) => o.id === value) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return list.slice(0, 8);
  }, [options, query]);

  function choose(o: Option | null) {
    onChange(o?.id ?? null);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        className="input"
        placeholder={selected ? selected.label : placeholder}
        value={open ? query : (selected?.label ?? "")}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open) {
            e.preventDefault();
            if (matches[active]) choose(matches[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-white py-1 shadow-lg">
          {allowEmpty && selected && (
            <li>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(null)} className="w-full px-3 py-2 text-left text-sm text-muted hover:bg-paper">
                Clear selection
              </button>
            </li>
          )}
          {matches.length === 0 && <li className="px-3 py-2 text-sm text-muted">Nothing matches &ldquo;{query}&rdquo;</li>}
          {matches.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
                className={`w-full px-3 py-2 text-left text-sm ${i === active ? "bg-brand-soft" : "hover:bg-paper"}`}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
