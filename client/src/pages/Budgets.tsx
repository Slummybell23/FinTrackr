import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loading } from "../components/Loading";
import { api, currency, currentMonth, monthLabel, shiftMonth, today } from "../lib/api";
import { useUser } from "../lib/user";
import type { Category, CategorySummary, MonthSummary } from "../lib/types";

interface Reline {
  category: Category;
  average: number;
  suggested: number;
  keptMonths: number;
}

/**
 * Read the last six months back against today's lines: when a line and its
 * habit have drifted apart, suggest re-lining it to what it actually runs.
 */
async function readTheLines(): Promise<Reline[]> {
  const now = currentMonth();
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(now, -(i + 1)));
  const [categories, ...summaries] = await Promise.all([
    api.categories(),
    ...months.map((m) => api.monthSummary(m)),
  ]);

  // Only months where the book was actually kept count toward the average.
  const kept = summaries.filter((s) => s.entryCount > 0);
  if (kept.length < 2) return [];

  return categories
    .flatMap((category) => {
      const average =
        kept.reduce(
          (sum, s) => sum + (s.categories.find((c) => c.categoryId === category.id)?.spent ?? 0),
          0,
        ) / kept.length;
      const drift = average - category.monthlyBudget;
      if (Math.abs(drift) < Math.max(10, category.monthlyBudget * 0.15)) return [];
      const suggested = Math.round(average / 5) * 5;
      if (suggested === category.monthlyBudget || suggested < 0) return [];
      return [{ category, average, suggested, keptMonths: kept.length }];
    })
    .sort((a, b) => Math.abs(b.average - b.category.monthlyBudget) - Math.abs(a.average - a.category.monthlyBudget))
    .slice(0, 4);
}

export default function Budgets() {
  const user = useUser();
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [managing, setManaging] = useState(false);
  const [relines, setRelines] = useState<Reline[]>([]);

  const reload = useCallback(() => {
    api.monthSummary(month).then(setSummary).catch(() => {});
  }, [month]);

  useEffect(reload, [reload]);

  useEffect(() => {
    readTheLines().then(setRelines).catch(() => {});
  }, []);

  async function adoptReline(reline: Reline) {
    await api
      .updateCategory(reline.category.id, {
        name: reline.category.name,
        emoji: reline.category.emoji,
        monthlyBudget: reline.suggested,
        sortOrder: reline.category.sortOrder,
      })
      .catch(() => {});
    setRelines((all) => all.filter((r) => r.category.id !== reline.category.id));
    reload();
  }

  const isCurrentMonth = month === currentMonth();
  const [viewYear, viewMon] = month.split("-").map(Number);
  const daysInViewedMonth = new Date(viewYear, viewMon, 0).getDate();
  const dayOfMonth = isCurrentMonth ? Number(today().slice(8, 10)) : daysInViewedMonth;

  function line(category: CategorySummary) {
    const ratio = category.budget > 0 ? Math.min(1, category.spent / category.budget) : 0;
    const over = category.spent > category.budget;
    const projected = dayOfMonth > 0 ? (category.spent / dayOfMonth) * daysInViewedMonth : 0;
    const showProjection = isCurrentMonth && category.spent > 0 && dayOfMonth < daysInViewedMonth;
    const projectedOver = category.budget > 0 && projected > category.budget;
    // What the line can afford per day from here — spend at most this and it
    // holds. Hidden once it would round to $0.00; that line is simply spent.
    const daysLeft = daysInViewedMonth - dayOfMonth + 1;
    const remaining = category.budget - category.spent;
    const safeDaily =
      isCurrentMonth && category.budget > 0 && remaining / daysLeft >= 0.005
        ? remaining / daysLeft
        : null;
    return (
      <li key={category.categoryId} className="mb-6 break-inside-avoid">
        <div className="mb-1 flex items-baseline justify-between">
          <Link to={`/categories/${category.categoryId}`} className="text-sm">
            {category.emoji ? `${category.emoji} ` : ""}
            {category.name}
            <span className="text-ink-faint"> ›</span>
          </Link>
          <p className={`text-sm ${over ? "text-accent" : "text-ink-mute"}`}>
            {currency.format(category.spent)}
            <span className="text-ink-faint"> / {currency.format(category.budget)}</span>
          </p>
        </div>
        <div className="h-1 w-full rounded-full bg-edge">
          <div
            className={`h-1 rounded-full ${over ? "bg-accent" : "bg-ink-mute"}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        {(showProjection || safeDaily !== null) && (
          <p className="mt-1 text-xs text-ink-faint">
            {showProjection && (
              <span className={projectedOver ? "text-accent" : ""}>
                pacing to {currency.format(projected)}
                {projectedOver && ` · ${currency.format(projected - category.budget)} over`}
              </span>
            )}
            {showProjection && safeDaily !== null && " · "}
            {safeDaily !== null && <>≈ {currency.format(safeDaily)} a day holds it</>}
          </p>
        )}
      </li>
    );
  }

  // Group the lines when any line carries a group; ungrouped fall under "Other".
  const groupNames = summary
    ? [...new Set(summary.categories.map((c) => c.group).filter((g): g is string => !!g))]
    : [];
  const ungrouped = summary?.categories.filter((c) => !c.group) ?? [];

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-serif text-2xl font-light">Budgets</h1>
        <p className="text-sm text-ink-mute">The month against its lines.</p>
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

      {managing ? (
        <CategoryManager
          onDone={() => {
            setManaging(false);
            reload();
          }}
        />
      ) : !summary ? (
        <Loading />
      ) : (
        <>
          {month < currentMonth() && (
            <section className="mb-8 card p-4">
              <p className="label-micro">
                Closing the book
              </p>
              <p className="mt-1 text-sm text-ink-mute">
                {currency.format(summary.spent)} spent of{" "}
                {currency.format(summary.budgetTotal)} budgeted ·{" "}
                {summary.categories.filter((c) => c.spent <= c.budget).length} lines held,{" "}
                {summary.categories.filter((c) => c.spent > c.budget).length} ran over.
              </p>
            </section>
          )}
          {groupNames.length === 0 ? (
            <ul className="lg:columns-2 lg:gap-x-10">{summary.categories.map(line)}</ul>
          ) : (
            <div className="space-y-8">
              {[...groupNames.map((g) => ({
                name: g,
                lines: summary.categories.filter((c) => c.group === g),
              })), ...(ungrouped.length ? [{ name: "Other", lines: ungrouped }] : [])].map(
                (grp) => {
                  const spent = grp.lines.reduce((s, c) => s + c.spent, 0);
                  const budget = grp.lines.reduce((s, c) => s + c.budget, 0);
                  return (
                    <section key={grp.name}>
                      <div className="mb-3 flex items-baseline justify-between border-b border-edge pb-1">
                        <h2 className="label-micro">{grp.name}</h2>
                        <p className="text-xs text-ink-faint">
                          {currency.format(spent)} / {currency.format(budget)}
                        </p>
                      </div>
                      <ul>{grp.lines.map(line)}</ul>
                    </section>
                  );
                },
              )}
            </div>
          )}

          {month === currentMonth() && relines.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-1 label-micro">Reading the lines</h2>
              <p className="mb-3 text-xs text-ink-faint">
                What the last {relines[0].keptMonths} kept months say about today's lines.
              </p>
              <ul className="space-y-3">
                {relines.map((reline) => (
                  <li key={reline.category.id} className="card px-4 py-3">
                    <p className="text-sm">
                      {reline.category.emoji ? `${reline.category.emoji} ` : ""}
                      {reline.category.name} runs about{" "}
                      <span className="text-ink">{currency.format(reline.average)}</span> a month;
                      the line says {currency.format(reline.category.monthlyBudget)}.
                    </p>
                    <button
                      onClick={() => adoptReline(reline)}
                      className="mt-1.5 text-sm text-accent"
                    >
                      Re-line to {currency.format(reline.suggested)}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <button onClick={() => setManaging(true)} className="mt-8 text-sm text-accent">
            Manage lines
          </button>

          <nav className="mt-10 divide-y divide-edge border-t border-edge">
            <Link to="/recurring" className="flex justify-between py-4 text-sm">
              <span>Recurring</span>
              <span className="text-ink-faint">everything that leaves on its own ›</span>
            </Link>
            <Link to="/goals" className="flex justify-between py-4 text-sm">
              <span>Savings</span>
              <span className="text-ink-faint">buckets you split into ›</span>
            </Link>
            {user?.challenges && (
              <Link to="/challenges" className="flex justify-between py-4 text-sm">
                <span>Challenges</span>
                <span className="text-ink-faint">a goal with teeth ›</span>
              </Link>
            )}
            <Link to="/debts" className="flex justify-between py-4 text-sm">
              <span>Debts</span>
              <span className="text-ink-faint">the slow crawl out ›</span>
            </Link>
            <Link to="/year" className="flex justify-between py-4 text-sm">
              <span>The long view</span>
              <span className="text-ink-faint">the year in months ›</span>
            </Link>
            <Link to={`/report/${month}`} className="flex justify-between py-4 text-sm">
              <span>The printed page</span>
              <span className="text-ink-faint">close the book on paper ›</span>
            </Link>
          </nav>
        </>
      )}
    </div>
  );
}

export function CategoryManager({ onDone }: { onDone: () => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newName, setNewName] = useState("");
  const [newBudget, setNewBudget] = useState("");

  useEffect(() => {
    api.categories().then(setCategories).catch(() => {});
  }, []);

  function editLocal(id: number, patch: Partial<Category>) {
    setCategories((all) => all.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= categories.length) return;
    const reordered = [...categories];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const renumbered = reordered.map((c, i) => ({ ...c, sortOrder: i }));
    setCategories(renumbered);
    await Promise.all(renumbered.map(save));
  }

  async function save(category: Category) {
    await api
      .updateCategory(category.id, {
        name: category.name,
        emoji: category.emoji,
        monthlyBudget: category.monthlyBudget,
        sortOrder: category.sortOrder,
        group: category.group,
      })
      .catch(() => {});
  }

  const knownGroups = [
    ...new Set(categories.map((c) => c.group).filter((g): g is string => !!g)),
  ];

  async function remove(category: Category) {
    if (!window.confirm(`Delete "${category.name}"? Its entries become uncategorized.`)) return;
    await api.deleteCategory(category.id).catch(() => {});
    setCategories((all) => all.filter((c) => c.id !== category.id));
  }

  async function add() {
    const budget = Number.parseFloat(newBudget);
    if (!newName.trim() || !Number.isFinite(budget) || budget < 0) return;
    const created = await api.createCategory({
      name: newName.trim(),
      emoji: null,
      monthlyBudget: budget,
      sortOrder: categories.length,
    });
    setCategories((all) => [...all, created]);
    setNewName("");
    setNewBudget("");
  }

  const field =
    "field-sm";

  return (
    <div>
      <datalist id="category-groups">
        {knownGroups.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <ul className="space-y-3">
        {categories.map((category, index) => (
          <li key={category.id} className="space-y-2 border-b border-edge pb-3">
            <div className="flex items-center gap-2">
              <span className="flex flex-col">
                <button
                  onClick={() => move(index, -1)}
                  className="px-1 text-[10px] leading-3 text-ink-faint"
                  aria-label={`Move ${category.name} up`}
                >
                  ▲
                </button>
                <button
                  onClick={() => move(index, 1)}
                  className="px-1 text-[10px] leading-3 text-ink-faint"
                  aria-label={`Move ${category.name} down`}
                >
                  ▼
                </button>
              </span>
              <input
                className={`${field} w-12 text-center`}
                value={category.emoji ?? ""}
                placeholder="·"
                onChange={(e) => editLocal(category.id, { emoji: e.target.value || null })}
                onBlur={() => save(category)}
                aria-label="Emoji"
              />
              <input
                className={`${field} min-w-0 flex-1`}
                value={category.name}
                onChange={(e) => editLocal(category.id, { name: e.target.value })}
                onBlur={() => save(category)}
                aria-label="Name"
              />
              <input
                className={`${field} w-24 text-right`}
                inputMode="decimal"
                value={category.monthlyBudget}
                onChange={(e) =>
                  editLocal(category.id, { monthlyBudget: Number(e.target.value) || 0 })
                }
                onBlur={() => save(category)}
                aria-label="Monthly budget"
              />
              <button
                onClick={() => remove(category)}
                className="px-1 text-ink-faint"
                aria-label={`Delete ${category.name}`}
              >
                ✕
              </button>
            </div>
            <input
              className={`${field} w-full`}
              list="category-groups"
              value={category.group ?? ""}
              placeholder="Group: Needs, Wants, Fixed… (optional)"
              onChange={(e) => editLocal(category.id, { group: e.target.value || null })}
              onBlur={() => save(category)}
              aria-label="Group"
            />
          </li>
        ))}
      </ul>

      <div className="mt-6 flex items-center gap-2">
        <input
          className={`${field} flex-1`}
          placeholder="New line"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <input
          className={`${field} w-24 text-right`}
          inputMode="decimal"
          placeholder="0"
          value={newBudget}
          onChange={(e) => setNewBudget(e.target.value)}
        />
        <button onClick={add} className="px-2 text-accent">
          Add
        </button>
      </div>

      <button onClick={onDone} className="mt-8 btn-ink px-5 py-2.5 text-sm">
        Done
      </button>
    </div>
  );
}
