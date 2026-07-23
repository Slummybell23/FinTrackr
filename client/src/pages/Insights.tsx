import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Columns, PaceChart } from "../components/charts";
import { Loading } from "../components/Loading";
import { api, currency, currentMonth, shiftMonth, today } from "../lib/api";
import { useUser } from "../lib/user";
import type { Debt, Entry, MonthSummary, PatternSuggestion, SavingsGoal } from "../lib/types";

export default function Insights() {
  const user = useUser();
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [lastSummary, setLastSummary] = useState<MonthSummary | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [priorEntries, setPriorEntries] = useState<Entry[]>([]);
  const [patterns, setPatterns] = useState<PatternSuggestion[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);

  useEffect(() => {
    const month = currentMonth();
    api.monthSummary(month).then(setSummary).catch(() => {});
    api.monthSummary(shiftMonth(month, -1)).then(setLastSummary).catch(() => {});
    api.entries({ month, limit: 500 }).then(setEntries).catch(() => {});
    // Two months back feed the week's shape, the leaderboard, and the streaks.
    Promise.all(
      [shiftMonth(month, -1), shiftMonth(month, -2)].map((m) =>
        api.entries({ month: m, kind: "Expense", limit: 500 }),
      ),
    )
      .then((lists) => setPriorEntries(lists.flat()))
      .catch(() => {});
    api.patterns().then(setPatterns).catch(() => {});
    api.goals().then(setGoals).catch(() => {});
    api.debts().then(setDebts).catch(() => {});
  }, []);

  const saved = goals.reduce((sum, g) => sum + g.savedAmount, 0);
  const remaining = (d: Debt) => d.startingAmount - d.paidAmount;
  const shortOwed = debts.filter((d) => d.kind === "ShortTerm").reduce((s, d) => s + remaining(d), 0);
  const longOwed = debts.filter((d) => d.kind === "LongTerm").reduce((s, d) => s + remaining(d), 0);

  const spentCategories =
    summary?.categories.filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent) ?? [];
  const max = Math.max(0, ...spentCategories.flatMap((c) => [c.spent, c.budget]));

  // Savings rate: the share of what came in that you didn't spend.
  const keptRate =
    summary && summary.income > 0
      ? Math.round(((summary.income - summary.spent) / summary.income) * 100)
      : null;

  const deltas = categoryDeltas(summary, lastSummary);
  const leaders = vendorLeaderboard(entries, priorEntries);
  const records = streakRecords(entries, priorEntries);

  async function adoptPattern(suggestion: PatternSuggestion) {
    const next = new Date();
    next.setDate(next.getDate() + suggestion.intervalDays);
    await api
      .createRecurring({
        name: suggestion.vendorName,
        amount: suggestion.averageAmount,
        cadence: suggestion.suggestedCadence,
        nextDate: next.toISOString().slice(0, 10),
        categoryId: suggestion.categoryId ?? undefined,
      })
      .catch(() => {});
    setPatterns((all) => all.filter((p) => p.vendorName !== suggestion.vendorName));
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-serif text-2xl font-light">Insights</h1>
        <p className="text-sm text-ink-mute">Where it went.</p>
      </header>

      {!summary ? (
        <Loading />
      ) : (
        <>
          <section className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card p-3">
              <p className="label-micro">Entries</p>
              <p className="font-serif text-2xl font-light">{summary.entryCount}</p>
            </div>
            <div className="card p-3">
              <p className="label-micro">No-spend</p>
              <p className="font-serif text-2xl font-light">{summary.noSpendDays}</p>
            </div>
            <div className="card p-3">
              <p className="label-micro">Came in</p>
              <p className="font-serif text-2xl font-light">{currency.format(summary.income)}</p>
            </div>
            <div className="card p-3" title="Income kept, not spent, this month">
              <p className="label-micro">Kept</p>
              <p className="font-serif text-2xl font-light">
                {keptRate === null ? "—" : `${keptRate}%`}
              </p>
            </div>
          </section>

          {user && user.savingsRateTarget > 0 && (
            <p className="-mt-6 mb-10 text-xs text-ink-faint">
              Aiming to keep {user.savingsRateTarget}% ·{" "}
              {keptRate === null
                ? "no income logged yet this month"
                : keptRate >= user.savingsRateTarget
                  ? `ahead of it, at ${keptRate}%`
                  : `at ${keptRate}% so far`}
              .
            </p>
          )}

          <div className="lg:columns-2 lg:gap-10">
          {(goals.length > 0 || debts.length > 0) && (
            <section className="mb-10 break-inside-avoid">
              <h2 className="mb-3 label-micro">Standing</h2>
              <div className="card p-4">
                <p className="font-serif text-3xl font-light">
                  {saved - shortOwed >= 0 ? "" : "−"}
                  {currency.format(Math.abs(saved - shortOwed))}
                </p>
                <p className="mt-1 text-sm text-ink-mute">
                  {currency.format(saved)} in the jars − {currency.format(shortOwed)} short-term
                  debt.
                </p>
                {longOwed > 0 && (
                  <p className="mt-2 border-t border-edge pt-2 text-xs text-ink-faint">
                    The long road carries {currency.format(longOwed)} more: car loans and the
                    like, paid on schedule, not counted against your standing.
                  </p>
                )}
              </div>
            </section>
          )}

          <Pace entries={entries} summary={summary} />

          <Rhythm entries={entries} />

          <WeekShape entries={entries} priorEntries={priorEntries} />

          {patterns.length > 0 && (
            <section className="mb-10 break-inside-avoid">
              <h2 className="mb-3 label-micro">
                Patterns FinTrackr found
              </h2>
              <ul className="space-y-3">
                {patterns.map((p) => (
                  <li
                    key={p.vendorName}
                    className="flex items-center justify-between card px-4 py-3"
                  >
                    <div>
                      <p className="text-sm">{p.vendorName}</p>
                      <p className="text-xs text-ink-faint">
                        {p.count}× · ~{currency.format(p.averageAmount)} every {p.intervalDays}{" "}
                        days
                      </p>
                    </div>
                    <button onClick={() => adoptPattern(p)} className="text-sm text-accent">
                      Make recurring
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mb-10 break-inside-avoid">
            <h2 className="mb-4 label-micro">
              By category
            </h2>
            {spentCategories.length === 0 ? (
              <p className="text-sm text-ink-faint">Nothing spent this month yet.</p>
            ) : (
              <>
                <ul className="space-y-4">
                  {spentCategories.map((category) => {
                    const over = category.spent > category.budget;
                    return (
                      <li key={category.categoryId}>
                        <div className="mb-1 flex items-baseline justify-between">
                          <p className="text-sm">
                            {category.emoji ? `${category.emoji} ` : ""}
                            {category.name}
                          </p>
                          <p className="text-sm text-ink-mute">
                            {currency.format(category.spent)}
                            {category.budget > 0 && (
                              <span className="text-ink-faint">
                                {" "}
                                / {currency.format(category.budget)}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="relative h-3">
                          {category.budget > 0 && (
                            <div
                              className="absolute inset-y-0 left-0 rounded-sm bg-edge/60"
                              style={{ width: `${max ? (category.budget / max) * 100 : 0}%` }}
                            />
                          )}
                          <div
                            className={`absolute inset-y-0 left-0 rounded-sm ${
                              over ? "bg-accent" : "bg-ink-mute/75"
                            }`}
                            style={{ width: `${max ? (category.spent / max) * 100 : 0}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-xs text-ink-faint">
                  The pale track is the line; ink past its end has run over.
                </p>
              </>
            )}
          </section>

          {deltas.length > 0 && (
            <section className="mb-10 break-inside-avoid">
              <h2 className="mb-3 label-micro">Compared to last month</h2>
              <ul className="space-y-2">
                {deltas.map((d) => (
                  <li key={d.name} className="flex items-baseline justify-between text-sm">
                    <span>
                      {d.emoji ? `${d.emoji} ` : ""}
                      {d.name}
                    </span>
                    <span className={d.delta > 0 ? "text-accent" : "text-ink-mute"}>
                      {d.delta > 0 ? "▲" : "▼"} {currency.format(Math.abs(d.delta))}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-faint">
                The lines that moved most against last month.
              </p>
            </section>
          )}

          {records && (
            <section className="mb-10 break-inside-avoid">
              <h2 className="mb-3 label-micro">Streaks &amp; records</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="card p-3">
                  <p className="label-micro">Current</p>
                  <p className="font-serif text-2xl font-light">{records.current}</p>
                  <p className="text-xs text-ink-faint">no-spend days</p>
                </div>
                <div className="card p-3">
                  <p className="label-micro">Longest</p>
                  <p className="font-serif text-2xl font-light">{records.longest}</p>
                  <p className="text-xs text-ink-faint">in a row</p>
                </div>
                <div className="card p-3">
                  <p className="label-micro">This month</p>
                  <p className="font-serif text-2xl font-light">{summary.noSpendDays}</p>
                  <p className="text-xs text-ink-faint">no-spend</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-ink-faint">
                No-spend streaks, read over the last three months.
              </p>
            </section>
          )}

          {leaders.length > 0 && (
            <section className="mb-10 break-inside-avoid">
              <h2 className="mb-3 label-micro">Top vendors</h2>
              <ul className="space-y-2">
                {leaders.map((v) => (
                  <li key={v.name} className="flex items-baseline justify-between text-sm">
                    <span>
                      {v.name}
                      <span className="text-xs text-ink-faint"> · {v.count}×</span>
                    </span>
                    <span className="text-ink-mute">{currency.format(v.total)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-faint">
                Where the most went, over the last three months.
              </p>
            </section>
          )}
          </div>

          <nav className="divide-y divide-edge border-t border-edge">
            <Link to="/review" className="flex justify-between py-4 text-sm">
              <span>Weekly review</span>
              <span className="text-ink-faint">the Sunday recap ›</span>
            </Link>
            <Link to="/year" className="flex justify-between py-4 text-sm">
              <span>The long view</span>
              <span className="text-ink-faint">the year in months ›</span>
            </Link>
          </nav>
        </>
      )}
    </div>
  );
}

/** The category lines that moved most against last month, biggest swing first. */
function categoryDeltas(
  summary: MonthSummary | null,
  lastSummary: MonthSummary | null,
): { name: string; emoji: string | null; delta: number }[] {
  if (!summary || !lastSummary) return [];
  const lastByCategory = new Map(lastSummary.categories.map((c) => [c.categoryId, c.spent]));
  return summary.categories
    .map((c) => ({
      name: c.name,
      emoji: c.emoji,
      delta: c.spent - (lastByCategory.get(c.categoryId) ?? 0),
    }))
    .filter((d) => Math.abs(d.delta) >= 1)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 5);
}

/** Vendors by total spend across the fetched window (this month + two prior). */
function vendorLeaderboard(
  entries: Entry[],
  priorEntries: Entry[],
): { name: string; total: number; count: number }[] {
  const byVendor = new Map<string, { total: number; count: number }>();
  // entries holds the current month (income and all); priorEntries is expenses only.
  for (const entry of [...entries.filter((e) => e.kind === "Expense"), ...priorEntries]) {
    if (!entry.vendorName) continue;
    const running = byVendor.get(entry.vendorName) ?? { total: 0, count: 0 };
    running.total += entry.amount;
    running.count += 1;
    byVendor.set(entry.vendorName, running);
  }
  return [...byVendor.entries()]
    .map(([name, v]) => ({ name, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
}

/** No-spend streaks over the fetched window: the trailing run, and the longest. */
function streakRecords(
  entries: Entry[],
  priorEntries: Entry[],
): { current: number; longest: number } | null {
  const spendDays = new Set(
    [...entries, ...priorEntries].filter((e) => e.kind === "Expense").map((e) => e.date),
  );
  if (spendDays.size === 0) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const start = new Date(`${shiftMonth(currentMonth(), -2)}-01T00:00:00`);
  const end = new Date(`${today()}T00:00:00`);

  let longest = 0;
  let run = 0;
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (spendDays.has(iso(d))) run = 0;
    else longest = Math.max(longest, ++run);
  }

  let current = 0;
  for (const d = new Date(end); d >= start; d.setDate(d.getDate() - 1)) {
    if (spendDays.has(iso(d))) break;
    current += 1;
  }

  return { current, longest };
}

/** Cumulative spend against the even pace of the month's allowance. */
function Pace({ entries, summary }: { entries: Entry[]; summary: MonthSummary }) {
  const month = currentMonth();
  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const todayDay = Number(today().slice(8, 10));
  const allowance = Math.max(0, summary.budgetTotal + summary.carryOver);

  const byDay = new Array<number>(todayDay).fill(0);
  for (const entry of entries) {
    if (entry.kind !== "Expense") continue;
    const day = Number(entry.date.slice(8, 10));
    if (day >= 1 && day <= todayDay) byDay[day - 1] += entry.amount;
  }
  const cumulative: number[] = [];
  let running = 0;
  for (const amount of byDay) {
    running += amount;
    cumulative.push(running);
  }

  const spentSoFar = cumulative[cumulative.length - 1] ?? 0;
  const evenPaceToday = (allowance * todayDay) / daysInMonth;
  const drift = spentSoFar - evenPaceToday;

  // A projection needs a few days on the books before it means anything.
  const projected =
    todayDay >= 3 && todayDay < daysInMonth && spentSoFar > 0
      ? (spentSoFar / todayDay) * daysInMonth
      : undefined;

  const paceLine =
    allowance <= 0
      ? "Set your budget lines to draw the even pace."
      : drift > 0
        ? `${currency.format(drift)} ahead of the even pace. The dashed line is your lines, spread evenly across the month.`
        : `${currency.format(-drift)} in hand against the even pace. The dashed line is your lines, spread evenly across the month.`;

  return (
    <section className="mb-10 break-inside-avoid">
      <h2 className="mb-3 label-micro">The month's pace</h2>
      <PaceChart
        cumulative={cumulative}
        daysInMonth={daysInMonth}
        allowance={allowance}
        month={month}
        projected={projected}
      />
      <p className="mt-2 text-xs text-ink-faint">
        {paceLine}
        {projected !== undefined && (
          <>
            {" "}
            At this pace the month closes near{" "}
            <span className="text-ink-mute">{currency.format(projected)}</span>
            {allowance > 0 && projected > allowance
              ? `, ${currency.format(projected - allowance)} over the lines.`
              : "."}
          </>
        )}
      </p>
    </section>
  );
}

/** The average cost of each day of the week, read over the last ~90 days. */
function WeekShape({ entries, priorEntries }: { entries: Entry[]; priorEntries: Entry[] }) {
  const windowStart = `${shiftMonth(currentMonth(), -2)}-01`;
  const end = today();

  // How many of each weekday the window actually held.
  const weekdayCounts = new Array<number>(7).fill(0);
  const cursor = new Date(`${windowStart}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    weekdayCounts[cursor.getDay()] += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  const totals = new Array<number>(7).fill(0);
  for (const entry of [...entries, ...priorEntries]) {
    if (entry.kind !== "Expense") continue;
    if (entry.date < windowStart || entry.date > end) continue;
    totals[new Date(`${entry.date}T00:00:00`).getDay()] += entry.amount;
  }

  const averages = totals.map((t, dow) => (weekdayCounts[dow] > 0 ? t / weekdayCounts[dow] : 0));
  if (averages.every((a) => a === 0)) return null;

  const maxDow = averages.indexOf(Math.max(...averages));
  // 2023-01-01 fell on a Sunday; day offsets give locale weekday names.
  const weekdayName = (dow: number, style: "narrow" | "long") =>
    new Date(2023, 0, 1 + dow).toLocaleDateString(undefined, { weekday: style });

  return (
    <section className="mb-10 break-inside-avoid">
      <h2 className="mb-3 label-micro">The week's shape</h2>
      <Columns
        ariaLabel="Average spending by day of the week over the last three months."
        items={averages.map((avg, dow) => ({
          key: String(dow),
          label: weekdayName(dow, "narrow"),
          value: avg,
          title: `${weekdayName(dow, "long")} · about ${currency.format(avg)} on average`,
          emphasis: dow === maxDow,
        }))}
      />
      <p className="mt-2 text-xs text-ink-faint">
        The average {weekdayName(maxDow, "long")} costs about{" "}
        {currency.format(averages[maxDow])}, your priciest day, read over the last three
        months.
      </p>
    </section>
  );
}

/** The month as a grid of days: filled means money left the ledger that day. */
function Rhythm({ entries }: { entries: Entry[] }) {
  const month = currentMonth();
  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const todayDay = Number(today().slice(8, 10));
  const spendDays = new Set(
    entries.filter((e) => e.kind === "Expense").map((e) => Number(e.date.slice(8, 10))),
  );

  return (
    <section className="mb-10 break-inside-avoid">
      <h2 className="mb-3 label-micro">Rhythm</h2>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => (
          <div
            key={day}
            title={`${month}-${String(day).padStart(2, "0")}`}
            className={`flex h-8 items-center justify-center rounded text-[10px] ${
              day > todayDay
                ? "text-ink-faint/50"
                : spendDays.has(day)
                  ? "bg-accent/80 text-paper"
                  : "border border-edge text-ink-faint"
            }`}
          >
            {day}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-faint">Open days are no-spend days.</p>
    </section>
  );
}
