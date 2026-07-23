import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { WeekPairs, type DayPair } from "../components/charts";
import { Loading } from "../components/Loading";
import { api, currency } from "../lib/api";
import { useUser } from "../lib/user";
import type { Entry, ReviewSummary } from "../lib/types";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function Review() {
  const user = useUser();
  const [review, setReview] = useState<ReviewSummary | null>(null);
  const [pairs, setPairs] = useState<DayPair[]>([]);
  const [weekExpenses, setWeekExpenses] = useState<Entry[]>([]);

  useEffect(() => {
    api.review().then(setReview).catch(() => {});
  }, []);

  // The chart needs day-by-day figures; fetch the months the fortnight spans.
  useEffect(() => {
    if (!review) return;
    const rangeStart = addDays(review.from, -7);
    const months = [...new Set([rangeStart.slice(0, 7), review.to.slice(0, 7)])];
    Promise.all(months.map((month) => api.entries({ month, kind: "Expense", limit: 500 })))
      .then((lists) => {
        const all = lists.flat() as Entry[];
        // The week's priciest, for the worth-it reflection.
        setWeekExpenses(
          all
            .filter((e) => e.date >= review.from && e.date <= review.to)
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 6),
        );
        const byDate = new Map<string, number>();
        for (const entry of all) {
          byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + entry.amount);
        }
        setPairs(
          Array.from({ length: 7 }, (_, i) => {
            const day = addDays(review.from, i);
            const weekAgo = addDays(day, -7);
            const label = new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
              weekday: "narrow",
            });
            const dayName = new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
              weekday: "long",
            });
            const thisWeek = byDate.get(day) ?? 0;
            const lastWeek = byDate.get(weekAgo) ?? 0;
            return {
              key: day,
              label,
              thisWeek,
              lastWeek,
              title: `${dayName} · ${currency.format(thisWeek)} this week · ${currency.format(lastWeek)} last week`,
            };
          }),
        );
      })
      .catch(() => {});
  }, [review]);

  const delta = review ? review.thisWeek.spent - review.lastWeek.spent : 0;

  return (
    <div>
      <header className="mb-8">
        <Link to="/insights" className="text-sm text-ink-faint">
          ‹ Insights
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-light">Weekly review</h1>
        <p className="text-sm text-ink-mute">The last seven days, read back.</p>
      </header>

      {!review ? (
        <Loading />
      ) : (
        <>
          <section className="mb-10">
            <p className="label-micro">
              Spent this week
            </p>
            <p className="mt-2 font-serif text-5xl font-light tracking-tight">
              {currency.format(review.thisWeek.spent)}
            </p>
            <p className="mt-2 text-sm text-ink-mute">
              {delta === 0
                ? "Even with last week."
                : delta > 0
                  ? `${currency.format(delta)} more than last week.`
                  : `${currency.format(-delta)} less than last week.`}
            </p>
          </section>

          {pairs.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-3 label-micro">Day by day</h2>
              <WeekPairs
                pairs={pairs}
                ariaLabel="Daily spending this week beside the same days last week."
              />
            </section>
          )}

          <section className="grid grid-cols-3 gap-3">
            <div className="card p-3">
              <p className="label-micro">Entries</p>
              <p className="font-serif text-2xl font-light">{review.thisWeek.entryCount}</p>
            </div>
            <div className="card p-3">
              <p className="label-micro">No-spend</p>
              <p className="font-serif text-2xl font-light">{review.thisWeek.noSpendDays}</p>
            </div>
            <div className="card p-3">
              <p className="label-micro">Top line</p>
              <p className="truncate font-serif text-2xl font-light">
                {review.topCategory ?? "—"}
              </p>
            </div>
          </section>

          {review.biggestEntry && (
            <section className="mt-10">
              <h2 className="mb-3 label-micro">
                Biggest entry
              </h2>
              <Link
                to={`/entries/${review.biggestEntry.id}`}
                className="flex items-baseline justify-between card px-4 py-3"
              >
                <div>
                  <p className="text-sm">
                    {review.biggestEntry.vendorName ?? review.biggestEntry.note ?? "Entry"}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {review.biggestEntry.categoryName ?? "Uncategorized"} ·{" "}
                    {review.biggestEntry.date}
                  </p>
                </div>
                <p className="font-serif text-xl">
                  {currency.format(review.biggestEntry.amount)}
                </p>
              </Link>
            </section>
          )}

          {user?.reflection && weekExpenses.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-1 label-micro">Worth it?</h2>
              <p className="mb-3 text-xs text-ink-faint">
                Weigh the week's biggest expenses. The habit shifts the next ones.
              </p>
              <ul className="space-y-3">
                {weekExpenses.map((entry) => (
                  <li key={entry.id} className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm">
                        {entry.vendorName ?? entry.note ?? "Entry"}
                        <span className="text-ink-faint"> · {currency.format(entry.amount)}</span>
                      </p>
                      <p className="text-xs text-ink-faint">
                        {entry.categoryName ?? "Uncategorized"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {(["Worth", "Regret"] as const).map((verdict) => (
                        <button
                          key={verdict}
                          onClick={() => markWorth(entry, entry.worth === verdict ? null : verdict)}
                          className={`chip py-1 text-xs ${
                            entry.worth === verdict
                              ? verdict === "Worth"
                                ? "border-accent text-ink"
                                : "border-accent text-accent"
                              : "border-edge text-ink-faint"
                          }`}
                        >
                          {verdict === "Worth" ? "Worth it" : "Regret"}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );

  async function markWorth(entry: Entry, verdict: "Worth" | "Regret" | null) {
    setWeekExpenses((all) => all.map((e) => (e.id === entry.id ? { ...e, worth: verdict } : e)));
    await api.markWorth(entry.id, verdict).catch(() => {});
  }
}
