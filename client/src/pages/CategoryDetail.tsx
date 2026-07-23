import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Columns } from "../components/charts";
import { api, currency, currentMonth, monthLabel, shiftMonth, today } from "../lib/api";
import type { Category, Entry } from "../lib/types";

const HISTORY_MONTHS = 6;

/** A budget line up close: its entries for the month, against its line. */
export default function CategoryDetail() {
  const { id } = useParams();
  const categoryId = Number(id);
  const [category, setCategory] = useState<Category | null>(null);
  const [month, setMonth] = useState(currentMonth());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState<{ month: string; spent: number }[]>([]);

  useEffect(() => {
    api
      .categories()
      .then((all) => setCategory(all.find((c) => c.id === categoryId) ?? null))
      .catch(() => {});
  }, [categoryId]);

  useEffect(() => {
    api.entries({ categoryId, month }).then(setEntries).catch(() => {});
  }, [categoryId, month]);

  // The line over time: the viewed month and the five before it.
  useEffect(() => {
    const months = Array.from({ length: HISTORY_MONTHS }, (_, i) =>
      shiftMonth(month, i - (HISTORY_MONTHS - 1)),
    );
    Promise.all(
      months.map((m) => api.entries({ categoryId, month: m, kind: "Expense", limit: 500 })),
    )
      .then((lists) =>
        setHistory(
          months.map((m, i) => ({
            month: m,
            spent: lists[i].reduce((sum, e) => sum + e.amount, 0),
          })),
        ),
      )
      .catch(() => {});
  }, [categoryId, month]);

  const spent = entries
    .filter((e) => e.kind === "Expense")
    .reduce((sum, e) => sum + e.amount, 0);
  const budget = category?.monthlyBudget ?? 0;
  const ratio = budget > 0 ? Math.min(1, spent / budget) : 0;
  const average = entries.length > 0 ? spent / entries.length : 0;

  // The line's daily allowance from here, when the viewed month is the live one.
  const isCurrentMonth = month === currentMonth();
  const [viewYear, viewMon] = month.split("-").map(Number);
  const daysLeft = new Date(viewYear, viewMon, 0).getDate() - Number(today().slice(8, 10)) + 1;
  const remaining = budget - spent;
  const safeDaily =
    isCurrentMonth && budget > 0 && remaining / daysLeft >= 0.005 ? remaining / daysLeft : null;

  return (
    <div>
      <header className="mb-6">
        <Link to="/budgets" className="text-sm text-ink-faint">
          ‹ Budgets
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-light">
          {category ? `${category.emoji ? `${category.emoji} ` : ""}${category.name}` : "…"}
        </h1>
        <p className="text-sm text-ink-mute">Up close.</p>
      </header>

      <div className="mb-8 flex items-center justify-between">
        <button
          onClick={() => setMonth(shiftMonth(month, -1))}
          className="px-3 py-1 text-ink-faint"
          aria-label="Previous month"
        >
          ‹
        </button>
        <p className="font-serif text-lg">{monthLabel(month)}</p>
        <button
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= currentMonth()}
          className="px-3 py-1 text-ink-faint disabled:opacity-30"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <section className="mb-8">
        <p className="font-serif text-4xl font-light tracking-tight">
          {currency.format(spent)}
          {budget > 0 && (
            <span className="text-lg text-ink-faint"> of {currency.format(budget)}</span>
          )}
        </p>
        <div className="mt-3 h-1 w-full rounded-full bg-edge">
          <div
            className={`h-1 rounded-full ${spent > budget && budget > 0 ? "bg-accent" : "bg-ink-mute"}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-ink-mute">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
          {entries.length > 0 && <> · about {currency.format(average)} each</>}
        </p>
        {safeDaily !== null && (
          <p className="mt-1 text-sm text-ink-mute">
            ≈ <span className="text-ink">{currency.format(safeDaily)}</span> a day for the{" "}
            {daysLeft} {daysLeft === 1 ? "day" : "days"} left holds the line
          </p>
        )}
      </section>

      {history.some((h) => h.spent > 0) && (
        <section className="mb-8">
          <h2 className="mb-3 label-micro">The line over time</h2>
          <Columns
            ariaLabel={`Spending on this line over the last ${HISTORY_MONTHS} months.`}
            items={history.map((h) => ({
              key: h.month,
              label: new Date(`${h.month}-01T00:00:00`).toLocaleDateString(undefined, {
                month: "short",
              }),
              value: h.spent,
              title: `${monthLabel(h.month)} · ${currency.format(h.spent)}`,
              emphasis: h.month === month,
            }))}
            guide={budget > 0 ? budget : undefined}
            guideLabel={budget > 0 ? `line ${currency.format(budget)}` : undefined}
            onPick={(item) => setMonth(item.key)}
          />
          <p className="mt-2 text-xs text-ink-faint">
            The accent month is the one on this page. Tap another to read it.
          </p>
        </section>
      )}

      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-faint">Nothing filed here this month.</p>
      ) : (
        <ul className="divide-y divide-edge">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link
                to={`/entries/${entry.id}`}
                className="flex items-baseline justify-between py-3"
              >
                <div>
                  <p className="text-sm">{entry.vendorName ?? entry.note ?? "Entry"}</p>
                  <p className="text-xs text-ink-faint">
                    {new Date(`${entry.date}T00:00:00`).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                    {entry.note && entry.vendorName ? ` · ${entry.note}` : ""}
                  </p>
                </div>
                <p className="font-serif text-lg">{currency.format(entry.amount)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
