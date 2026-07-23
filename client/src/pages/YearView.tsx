import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Columns } from "../components/charts";
import { Loading } from "../components/Loading";
import { api, currency } from "../lib/api";
import type { YearSummary } from "../lib/types";

export default function YearView() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [summary, setSummary] = useState<YearSummary | null>(null);

  useEffect(() => {
    api.yearSummary(year).then(setSummary).catch(() => {});
  }, [year]);

  const totalSpent = summary?.months.reduce((s, m) => s + m.spent, 0) ?? 0;
  const totalIn = summary?.months.reduce((s, m) => s + m.income, 0) ?? 0;

  const monthName = (month: string) =>
    new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: "short" });

  return (
    <div>
      <header className="mb-6">
        <Link to="/insights" className="text-sm text-ink-faint">
          ‹ Insights
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-light">The long view</h1>
        <p className="text-sm text-ink-mute">The year in months.</p>
      </header>

      <div className="mb-8 flex items-center justify-between">
        <button onClick={() => setYear(year - 1)} className="px-3 py-1 text-ink-faint">
          ‹
        </button>
        <p className="font-serif text-lg">{year}</p>
        <button
          onClick={() => setYear(year + 1)}
          disabled={year >= new Date().getFullYear()}
          className="px-3 py-1 text-ink-faint disabled:opacity-30"
        >
          ›
        </button>
      </div>

      {!summary ? (
        <Loading />
      ) : (
        <>
          <p className="mb-6 text-sm text-ink-mute">
            <span className="text-ink">{currency.format(totalSpent)}</span> spent across the
            year{totalIn > 0 && <> · {currency.format(totalIn)} came in</>}
            {summary.budgetTotal > 0 && (
              <> · budgeted {currency.format(summary.budgetTotal)} a month</>
            )}
          </p>

          <section className="mb-8">
            <Columns
              ariaLabel={`Spending by month across ${year}.`}
              items={summary.months.map((m) => ({
                key: m.month,
                label: monthName(m.month),
                value: m.spent,
                title: `${monthName(m.month)} · ${currency.format(m.spent)} spent${
                  m.income > 0 ? ` · ${currency.format(m.income)} in` : ""
                }`,
                emphasis: summary.budgetTotal > 0 && m.spent > summary.budgetTotal,
              }))}
              guide={summary.budgetTotal > 0 ? summary.budgetTotal : undefined}
              guideLabel={`budget ${currency.format(summary.budgetTotal)}`}
            />
            {summary.budgetTotal > 0 && (
              <p className="mt-2 text-xs text-ink-faint">
                The dashed rule is the month's budget; accent months ran over it.
              </p>
            )}
          </section>

          <ul className="divide-y divide-edge border-t border-edge">
            {summary.months.map((m) => (
              <li key={m.month} className="flex items-baseline gap-3 py-2">
                <span className="w-8 label-micro">{monthName(m.month)}</span>
                <span className="flex-1 text-xs text-ink-faint">
                  {m.income > 0 ? `+${currency.format(m.income)} in` : ""}
                </span>
                <span className="text-right text-sm text-ink-mute">
                  {m.spent > 0 ? currency.format(m.spent) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
