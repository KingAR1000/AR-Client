import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CornerDownLeft, Search } from "lucide-react";

export type Command = {
  id: string;
  label: string;
  group: string;
  hint?: string;
  icon?: ReactNode;
  run: () => void;
};

const score = (text: string, query: string) => {
  const t = text.toLowerCase();
  if (t.startsWith(query)) return 3;
  if (t.split(/\s+/).some((w) => w.startsWith(query))) return 2;
  let i = 0;
  for (const c of t) if (c === query[i]) i++;
  return i === query.length ? 1 : 0;
};

export default function Palette({
  commands,
  close,
}: {
  commands: Command[];
  close: () => void;
}) {
  const [query, setQuery] = useState(""),
    [index, setIndex] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands
      .map((c) => ({ c, s: score(`${c.label} ${c.hint || ""}`, q) }))
      .filter((r) => r.s)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.c);
  }, [commands, query]);
  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    list.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);
  const run = (command?: Command) => {
    if (!command) return;
    close();
    command.run();
  };
  let group = "";
  return (
    <div className="modal-backdrop palette-backdrop" onMouseDown={close}>
      <div
        className="palette"
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <label className="palette-search">
          <Search size={17} />
          <input
            autoFocus
            value={query}
            placeholder="Search pages, installations and actions…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") run(results[index]);
              else if (e.key === "Escape") close();
            }}
          />
          <kbd>Esc</kbd>
        </label>
        <div className="palette-results" ref={list}>
          {!results.length && <p className="list-empty">No results</p>}
          {results.map((c, i) => {
            const heading = c.group !== group && !query ? c.group : "";
            group = c.group;
            return (
              <div key={c.id}>
                {heading && <span className="palette-group">{heading}</span>}
                <button
                  data-index={i}
                  className={i === index ? "active" : ""}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => run(c)}
                >
                  <span className="palette-icon">{c.icon}</span>
                  <span className="grow">{c.label}</span>
                  {c.hint && <small>{c.hint}</small>}
                  {i === index && <CornerDownLeft size={14} />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
