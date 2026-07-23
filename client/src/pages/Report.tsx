import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BulletBar, Columns } from "../components/charts";
import { Loading } from "../components/Loading";
import { api, currency, currentMonth, monthLabel } from "../lib/api";
import type { Entry, MonthSummary } from "../lib/types";

/**
 * The book on a month, set for paper: summary figures, the lines, and the
 * full ledger. Rendered standalone (no tab bar) at /report/:month and
 * printed ink-on-white whatever the screen theme.
 */
export default function Report() {
  const location = useLocation();
  const month =
    /^\/report\/(\d{4}-\d{2})$/.exec(location.pathname)?.[1] ?? currentMonth();
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    api.monthSummary(month).then(setSummary).catch(() => {});
    api.entries({ month, limit: 500 }).then(setEntries).catch(() => {});
  }, [month]);

  // The printed ledger reads forward: earliest day first.
  const byDate = useMemo(() => {
    const groups = new Map<string, Entry[]>();
    for (const entry of [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
      const group = groups.get(entry.date) ?? [];
      group.push(entry);
      groups.set(entry.date, group);
    }
    return [...groups.entries()];
  }, [entries]);

  const over = summary ? summary.spent - (summary.budgetTotal + summary.carryOver) : 0;

  // The shape of the month: what left the ledger, day by day.
  const dailySpend = useMemo(() => {
    const [year, mon] = month.split("-").map(Number);
    const daysInMonth = new Date(year, mon, 0).getDate();
    const byDay = new Array<number>(daysInMonth).fill(0);
    for (const entry of entries) {
      if (entry.kind !== "Expense") continue;
      const day = Number(entry.date.slice(8, 10));
      if (day >= 1 && day <= daysInMonth) byDay[day - 1] += entry.amount;
    }
    return byDay;
  }, [entries, month]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="no-print mb-8 flex items-center justify-between">
        <Link to="/budgets" className="text-sm text-ink-faint">
          ‹ Budgets
        </Link>
        <button onClick={() => window.print()} className="btn-ink px-5 py-2.5 text-sm">
          Print, or save as PDF
        </button>
      </div>

      <header className="mb-10 border-b border-edge pb-6">
        <p className="label-micro">FinTrackr · The book on</p>
        <h1 className="mt-1 font-serif text-4xl font-light tracking-tight">
          {monthLabel(month)}
        </h1>
      </header>

      {!summary ? (
        <Loading />
      ) : (
        <>
          <section className="print-avoid-break mb-10">
            <h2 className="mb-4 label-micro">The month in sum</h2>
            <dl className="grid grid-cols-3 gap-x-6 gap-y-4">
              <Figure label="Budgeted" value={currency.format(summary.budgetTotal)} />
              <Figure label="Spent" value={currency.format(summary.spent)} />
              <Figure
                label={over > 0 ? "Over the lines" : "Left standing"}
                value={currency.format(Math.abs(over))}
              />
              <Figure label="Came in" value={currency.format(summary.income)} />
              <Figure label="Entries" value={String(summary.entryCount)} />
              <Figure label="No-spend days" value={String(summary.noSpendDays)} />
            </dl>
            {summary.carryOver !== 0 && (
              <p className="mt-3 text-xs text-ink-faint">
                Includes {currency.format(summary.carryOver)} carried from earlier months.
              </p>
            )}
          </section>

          {dailySpend.some((v) => v > 0) && (
            <section className="print-avoid-break mb-10">
              <h2 className="mb-3 label-micro">The shape of the month</h2>
              <Columns
                ariaLabel="Spending by day across the month."
                items={dailySpend.map((value, i) => {
                  const day = i + 1;
                  return {
                    key: String(day),
                    label: day === 1 || day % 7 === 0 ? String(day) : "",
                    value,
                    title: `${monthLabel(month).split(" ")[0]} ${day} · ${currency.format(value)}`,
                  };
                })}
              />
            </section>
          )}

          <section className="print-avoid-break mb-10">
            <h2 className="mb-3 label-micro">The lines</h2>
            <ul className="divide-y divide-edge border-y border-edge">
              {summary.categories.map((line) => {
                const ran = line.spent - line.budget;
                return (
                  <li key={line.categoryId} className="py-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span className="text-sm">
                        {line.emoji ? `${line.emoji} ` : ""}
                        {line.name}
                      </span>
                      <span className="text-sm text-ink-mute">
                        {currency.format(line.spent)}
                        <span className="text-ink-faint"> of {currency.format(line.budget)}</span>
                      </span>
                    </div>
                    <p className={`text-xs ${ran > 0 ? "text-accent" : "text-ink-faint"}`}>
                      {ran > 0
                        ? `ran over by ${currency.format(ran)}`
                        : `held with ${currency.format(-ran)} to spare`}
                    </p>
                    <div className="mt-1.5">
                      <BulletBar spent={line.spent} budget={line.budget} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="mb-3 label-micro">The ledger</h2>
            {byDate.length === 0 ? (
              <p className="text-sm text-ink-faint">A quiet month. Nothing written down.</p>
            ) : (
              byDate.map(([date, dayEntries]) => (
                <div key={date} className="print-avoid-break mb-5">
                  <h3 className="mb-1 label-micro">
                    {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                  </h3>
                  <ul className="divide-y divide-edge">
                    {dayEntries.map((entry) => (
                      <li key={entry.id} className="flex items-baseline justify-between py-1.5">
                        <span className="text-sm">
                          {entry.vendorName ?? entry.note ?? "Entry"}
                          <span className="text-xs text-ink-faint">
                            {"  "}
                            {entry.categoryName ?? "Uncategorized"}
                            {entry.note && entry.vendorName ? ` · ${entry.note}` : ""}
                            {entry.debtName ? ` · pays down ${entry.debtName}` : ""}
                          </span>
                        </span>
                        <span className="font-serif">
                          {entry.kind === "Income" ? "+" : ""}
                          {currency.format(entry.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>

          <footer className="border-t border-edge pt-4 text-xs text-ink-faint">
            FinTrackr · printed{" "}
            {new Date().toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            · edition {__APP_VERSION__}
          </footer>
        </>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label-micro">{label}</dt>
      <dd className="mt-0.5 font-serif text-xl font-light">{value}</dd>
    </div>
  );
}
