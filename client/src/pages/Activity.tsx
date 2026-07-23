import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, currency } from "../lib/api";
import type { Category, Entry, EntryKind } from "../lib/types";

const PAGE = 100;

export default function Activity() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [search, setSearch] = useState("");
  const [exhausted, setExhausted] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kind, setKind] = useState<EntryKind | "">("");
  const [categoryId, setCategoryId] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [tag, setTag] = useState("");

  useEffect(() => {
    api.categories().then(setCategories).catch(() => {});
  }, []);

  function filters(offset?: number) {
    return {
      search: search || undefined,
      kind: kind || undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      minAmount: minAmount ? Number(minAmount) : undefined,
      maxAmount: maxAmount ? Number(maxAmount) : undefined,
      tag: tag || undefined,
      limit: PAGE,
      offset,
    };
  }

  useEffect(() => {
    const handle = setTimeout(() => {
      api
        .entries(filters())
        .then((page) => {
          setEntries(page);
          setExhausted(page.length < PAGE);
        })
        .catch(() => {});
    }, 200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, kind, categoryId, minAmount, maxAmount, tag]);

  async function loadMore() {
    const page = await api.entries(filters(entries.length)).catch(() => [] as Entry[]);
    setEntries((all) => [...all, ...page]);
    setExhausted(page.length < PAGE);
  }

  const byDate = useMemo(() => {
    const groups = new Map<string, Entry[]>();
    for (const entry of entries) {
      const group = groups.get(entry.date) ?? [];
      group.push(entry);
      groups.set(entry.date, group);
    }
    return [...groups.entries()];
  }, [entries]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-serif text-2xl font-light">Activity</h1>
        <p className="text-sm text-ink-mute">The running ledger.</p>
      </header>

      <input
        id="activity-search"
        className="mb-3 field"
        placeholder="Search vendors and notes"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {tag && (
        <button
          onClick={() => setTag("")}
          className="mb-3 chip py-1 border-accent text-ink"
        >
          #{tag} <span className="ml-1 text-accent">✕</span>
        </button>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {([
          ["", "All"],
          ["Expense", "Spent"],
          ["Income", "Came in"],
        ] as const).map(([value, label]) => (
          <button
            key={label}
            onClick={() => setKind(value)}
            className={`chip px-3 py-1.5 ${
              kind === value ? "border-accent text-ink" : "border-edge text-ink-faint"
            }`}
          >
            {label}
          </button>
        ))}
        <select
          className="field-sm"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="Category filter"
        >
          <option value="">Any line</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji ? `${c.emoji} ` : ""}
              {c.name}
            </option>
          ))}
        </select>
        <input
          className="field-sm w-20 text-right"
          inputMode="decimal"
          placeholder="min"
          value={minAmount}
          onChange={(e) => setMinAmount(e.target.value)}
          aria-label="Minimum amount"
        />
        <input
          className="field-sm w-20 text-right"
          inputMode="decimal"
          placeholder="max"
          value={maxAmount}
          onChange={(e) => setMaxAmount(e.target.value)}
          aria-label="Maximum amount"
        />
      </div>

      {byDate.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-faint">No entries yet.</p>
      ) : (
        byDate.map(([date, dayEntries]) => {
          const daySpent = dayEntries
            .filter((e) => e.kind === "Expense")
            .reduce((sum, e) => sum + e.amount, 0);
          const dayIn = dayEntries
            .filter((e) => e.kind === "Income")
            .reduce((sum, e) => sum + e.amount, 0);
          return (
          <section key={date} className="mb-6">
            <div className="mb-1 flex items-baseline justify-between">
              <h2 className="label-micro">
                {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </h2>
              <p className="text-xs text-ink-faint">
                {daySpent > 0 && currency.format(daySpent)}
                {dayIn > 0 && (
                  <span className="text-accent">
                    {daySpent > 0 ? " · " : ""}+{currency.format(dayIn)}
                  </span>
                )}
              </p>
            </div>
            <ul className="divide-y divide-edge">
              {dayEntries.map((entry) => (
                <li key={entry.id} className="py-3">
                  <Link to={`/entries/${entry.id}`} className="flex items-baseline justify-between">
                    <div>
                      <p className="text-sm">
                        {entry.vendorName ?? entry.note ?? "Entry"}
                        {entry.vendorAlias && (
                          <span className="text-ink-faint"> · {entry.vendorAlias}</span>
                        )}
                      </p>
                      <p className="text-xs text-ink-faint">
                        {entry.categoryName ?? "Uncategorized"}
                        {entry.note && entry.vendorName ? ` · ${entry.note}` : ""}
                      </p>
                    </div>
                    <p
                      className={`font-serif text-lg ${
                        entry.kind === "Income" ? "text-accent" : ""
                      }`}
                    >
                      {entry.kind === "Income" ? "+" : ""}
                      {currency.format(entry.amount)}
                    </p>
                  </Link>
                  {entry.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {entry.tags.map((t) => (
                        <button
                          key={t}
                          onClick={() => setTag(t)}
                          className="rounded-full border border-edge px-2 py-0.5 text-xs text-ink-faint"
                        >
                          #{t}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
          );
        })
      )}

      {!exhausted && entries.length > 0 && (
        <button onClick={loadMore} className="w-full py-3 text-sm text-accent">
          Earlier pages of the ledger
        </button>
      )}
    </div>
  );
}
