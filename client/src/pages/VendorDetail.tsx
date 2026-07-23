import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Columns } from "../components/charts";
import { api, currency, currentMonth, monthLabel, shiftMonth } from "../lib/api";
import type { Entry, Vendor } from "../lib/types";

const HISTORY_MONTHS = 6;

/** A vendor up close: what you spend there, this month against last, over time. */
export default function VendorDetail() {
  const { id } = useParams();
  const vendorId = Number(id);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    api
      .vendors()
      .then((all) => setVendor(all.find((v) => v.id === vendorId) ?? null))
      .catch(() => {});
    api.entries({ vendorId, kind: "Expense", limit: 500 }).then(setEntries).catch(() => {});
  }, [vendorId]);

  // Sum by month, then read out the recent months and the two headline figures.
  const byMonth = useMemo(() => {
    const totals = new Map<string, number>();
    for (const entry of entries) {
      const month = entry.date.slice(0, 7);
      totals.set(month, (totals.get(month) ?? 0) + entry.amount);
    }
    return totals;
  }, [entries]);

  const now = currentMonth();
  const thisMonth = byMonth.get(now) ?? 0;
  const lastMonth = byMonth.get(shiftMonth(now, -1)) ?? 0;
  const delta = thisMonth - lastMonth;
  const allTime = entries.reduce((sum, e) => sum + e.amount, 0);

  const history = Array.from({ length: HISTORY_MONTHS }, (_, i) => {
    const month = shiftMonth(now, i - (HISTORY_MONTHS - 1));
    return { month, spent: byMonth.get(month) ?? 0 };
  });

  const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);

  return (
    <div className="lg:max-w-2xl">
      <header className="mb-6">
        <Link to="/vendors" className="text-sm text-ink-faint">
          ‹ Vendors
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-light">
          {vendor?.name ?? "…"}
          {vendor?.alias && <span className="text-lg text-ink-faint"> · {vendor.alias}</span>}
        </h1>
        <p className="text-sm text-ink-mute">What you spend here.</p>
      </header>

      <section className="mb-8">
        <p className="font-serif text-4xl font-light tracking-tight">
          {currency.format(thisMonth)}
          <span className="text-lg text-ink-faint"> this month</span>
        </p>
        <p className="mt-2 text-sm text-ink-mute">
          {lastMonth === 0 && thisMonth === 0
            ? "Nothing here lately."
            : delta === 0
              ? `Even with last month (${currency.format(lastMonth)}).`
              : delta > 0
                ? `${currency.format(delta)} more than last month (${currency.format(lastMonth)}).`
                : `${currency.format(-delta)} less than last month (${currency.format(lastMonth)}).`}
        </p>
        <p className="mt-1 text-xs text-ink-faint">
          {entries.length} {entries.length === 1 ? "visit" : "visits"} on record ·{" "}
          {currency.format(allTime)} all told
        </p>
      </section>

      {history.some((h) => h.spent > 0) && (
        <section className="mb-8">
          <h2 className="mb-3 label-micro">Over time</h2>
          <Columns
            ariaLabel={`Spending at this vendor over the last ${HISTORY_MONTHS} months.`}
            items={history.map((h) => ({
              key: h.month,
              label: new Date(`${h.month}-01T00:00:00`).toLocaleDateString(undefined, {
                month: "short",
              }),
              value: h.spent,
              title: `${monthLabel(h.month)} · ${currency.format(h.spent)}`,
              emphasis: h.month === now,
            }))}
          />
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <h2 className="mb-3 label-micro">Recent</h2>
          <ul className="divide-y divide-edge">
            {recent.map((entry) => (
              <li key={entry.id}>
                <Link
                  to={`/entries/${entry.id}`}
                  className="flex items-baseline justify-between py-3"
                >
                  <div>
                    <p className="text-sm">{entry.categoryName ?? "Uncategorized"}</p>
                    <p className="text-xs text-ink-faint">
                      {new Date(`${entry.date}T00:00:00`).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <p className="font-serif text-lg">{currency.format(entry.amount)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
