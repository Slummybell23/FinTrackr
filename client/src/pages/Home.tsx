import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, currency, currentMonth, today } from "../lib/api";
import { haptic } from "../lib/haptics";
import type { Entry, EntryTemplate, MonthSummary, RecurringItem } from "../lib/types";

/** Whole days from today until a date; negative if already past. */
function daysUntil(iso: string): number {
  const target = new Date(`${iso}T00:00:00`).getTime();
  const now = new Date(`${today()}T00:00:00`).getTime();
  return Math.round((target - now) / 86_400_000);
}

function whenLabel(days: number): string {
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export default function Home() {
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState(false);
  const queued = (useLocation().state as { queued?: boolean } | null)?.queued;
  const [templates, setTemplates] = useState<EntryTemplate[]>([]);
  const [recurring, setRecurring] = useState<RecurringItem[]>([]);
  const [managingQuickAdds, setManagingQuickAdds] = useState(false);

  function load() {
    const month = currentMonth();
    Promise.all([api.monthSummary(month), api.entries({ month })])
      .then(([s, e]) => {
        setSummary(s);
        setEntries(e);
      })
      .catch(() => setError(true));
    api.templates().then(setTemplates).catch(() => {});
    api.recurring().then(setRecurring).catch(() => {});
  }

  useEffect(load, []);

  async function quickAdd(template: EntryTemplate) {
    await api
      .createEntry({
        amount: template.amount,
        date: today(),
        vendorName: template.vendorName ?? undefined,
        categoryId: template.categoryId ?? undefined,
      })
      .catch(() => {});
    haptic();
    load();
  }

  async function removeTemplate(template: EntryTemplate) {
    await api.deleteTemplate(template.id).catch(() => {});
    setTemplates((all) => all.filter((t) => t.id !== template.id));
  }

  const todaysEntries = entries.filter((e) => e.date === today());
  const upcoming = [...recurring]
    .filter((r) => daysUntil(r.nextDate) <= 14)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .slice(0, 5);
  const spentRatio = summary && summary.budgetTotal > 0
    ? Math.min(1, summary.spent / summary.budgetTotal)
    : 0;

  // Safe to spend today: what's left, spread evenly over the days that remain.
  const [nowYear, nowMon] = currentMonth().split("-").map(Number);
  const daysInMonth = new Date(nowYear, nowMon, 0).getDate();
  const daysLeft = daysInMonth - Number(today().slice(8, 10)) + 1;
  const safeDaily =
    summary && summary.leftToSpend > 0 && daysLeft > 0 ? summary.leftToSpend / daysLeft : 0;

  return (
    <div>
      <header className="mb-10">
        <p className="label-micro">
          {new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </p>
        <h1 className="font-serif text-2xl font-light">FinTrackr</h1>
      </header>

      {queued && (
        <p className="mb-6 card px-4 py-3 text-sm text-ink-mute">
          You're offline. The entry is queued and will post itself when you're back.
        </p>
      )}

      {summary?.entryCount === 0 && (
        <section className="mb-10 card p-4">
          <p className="font-serif text-lg">A fresh book.</p>
          <p className="mt-1 text-sm text-ink-mute">
            Left to spend is your budget lines minus what you've spent, not a bank balance.
          </p>
          <Link to="/welcome" className="mt-2 inline-block text-sm text-accent">
            Begin here: set your lines ›
          </Link>
        </section>
      )}

      <div className="lg:grid lg:grid-cols-2 lg:gap-x-12 lg:items-start">
      <div>
      <section className="mb-10">
        <p className="label-micro">Left to spend</p>
        {summary ? (
          <>
            <p className="mt-2 font-serif text-6xl font-light tracking-tight">
              {currency.format(summary.leftToSpend)}
            </p>
            <div className="mt-4 h-px w-full bg-edge">
              <div className="h-px bg-accent" style={{ width: `${spentRatio * 100}%` }} />
            </div>
            <p className="mt-2 text-sm text-ink-mute">
              {currency.format(summary.spent)} spent of {currency.format(summary.budgetTotal)}{" "}
              budgeted ·{" "}
              <Link to="/budgets" className="text-accent">
                set your lines
              </Link>
            </p>
            {summary.carryOver !== 0 && (
              <p className="mt-1 text-xs text-ink-faint">
                includes {currency.format(summary.carryOver)} carried from earlier months
              </p>
            )}
            {safeDaily > 0 && (
              <p className="mt-3 text-sm text-ink-mute">
                ≈ <span className="text-ink">{currency.format(safeDaily)}</span> a day for the{" "}
                {daysLeft} {daysLeft === 1 ? "day" : "days"} left
              </p>
            )}
          </>
        ) : error ? (
          <p className="mt-2 font-serif text-6xl font-light text-ink-faint">—</p>
        ) : (
          <div className="mt-3 h-14 w-2/3 animate-pulse rounded bg-edge/60" aria-hidden="true" />
        )}
      </section>

      {templates.length > 0 && (
        <section className="mb-10">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="label-micro">Quick add</h2>
            <button
              onClick={() => setManagingQuickAdds(!managingQuickAdds)}
              className="text-xs text-ink-faint"
            >
              {managingQuickAdds ? "done" : "edit"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() =>
                  managingQuickAdds ? removeTemplate(template) : quickAdd(template)
                }
                className="chip py-1.5 border-edge text-ink-mute"
              >
                {template.name} · {currency.format(template.amount)}
                {managingQuickAdds && <span className="ml-2 text-accent">✕</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="mb-10">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="label-micro">Upcoming</h2>
            <Link to="/recurring" className="text-xs text-ink-faint">
              all recurring ›
            </Link>
          </div>
          <ul className="divide-y divide-edge">
            {upcoming.map((item) => {
              const days = daysUntil(item.nextDate);
              return (
                <li key={item.id} className="flex items-baseline justify-between py-2.5">
                  <div>
                    <p className="text-sm">{item.name}</p>
                    <p className={`text-xs ${days <= 1 ? "text-accent" : "text-ink-faint"}`}>
                      {whenLabel(days)}
                      {item.variable ? " · record it" : ""}
                    </p>
                  </div>
                  <p className="font-serif text-sm text-ink-mute">
                    {item.variable ? "~" : ""}
                    {currency.format(item.amount)}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      </div>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="label-micro">Today</h2>
          <Link to="/new" className="text-sm text-accent">
            + New entry
          </Link>
        </div>
        {todaysEntries.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-faint">
            Nothing logged today.
          </p>
        ) : (
          <ul className="divide-y divide-edge">
            {todaysEntries.map((entry) => (
              <li key={entry.id} className="flex items-baseline justify-between py-3">
                <div>
                  <p className="text-sm">{entry.vendorName ?? entry.note ?? "Entry"}</p>
                  <p className="text-xs text-ink-faint">{entry.categoryName ?? "Uncategorized"}</p>
                </div>
                <p className="font-serif text-lg">{currency.format(entry.amount)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  );
}
