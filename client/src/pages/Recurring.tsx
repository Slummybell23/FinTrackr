import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, currency, today } from "../lib/api";
import { haptic } from "../lib/haptics";
import type { Cadence, Category, RecurringItem } from "../lib/types";

const cadences: Cadence[] = ["Weekly", "Monthly", "Yearly"];

/** What one item costs across a year, for the subscription audit. */
function annualCost(item: RecurringItem): number {
  switch (item.cadence) {
    case "Weekly":
      return item.amount * 52;
    case "Yearly":
      return item.amount;
    default:
      return item.amount * 12;
  }
}

function monthlyEstimate(items: RecurringItem[]): number {
  return items.reduce((sum, item) => sum + annualCost(item) / 12, 0);
}

/** Whole days from today until a date; negative if it's already past. */
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

export default function Recurring() {
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<Cadence>("Monthly");
  const [nextDate, setNextDate] = useState(today());
  const [categoryId, setCategoryId] = useState("");
  const [variable, setVariable] = useState(false);

  useEffect(() => {
    api.recurring().then(setItems).catch(() => {});
    api.categories().then(setCategories).catch(() => {});
  }, []);

  const sorted = [...items].sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  const dueSoon = sorted.filter((i) => daysUntil(i.nextDate) <= 14);
  const annualTotal = items.reduce((sum, i) => sum + annualCost(i), 0);
  const priciest = [...items].sort((a, b) => annualCost(b) - annualCost(a))[0];
  const risen = items.filter((i) => i.previousAmount !== null && i.amount > i.previousAmount);

  function replace(updated: RecurringItem) {
    setItems((all) => all.map((i) => (i.id === updated.id ? updated : i)));
  }

  async function add() {
    const parsed = Number.parseFloat(amount);
    if (!name.trim() || !Number.isFinite(parsed) || parsed <= 0) return;
    const created = await api.createRecurring({
      name: name.trim(),
      amount: parsed,
      cadence,
      nextDate,
      categoryId: categoryId ? Number(categoryId) : undefined,
      variable,
    });
    setItems((all) => [...all, created]);
    setName("");
    setAmount("");
    setVariable(false);
  }

  async function remove(item: RecurringItem) {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    await api.deleteRecurring(item.id).catch(() => {});
    setItems((all) => all.filter((i) => i.id !== item.id));
  }

  const field = "field-sm";

  return (
    <div className="lg:max-w-2xl">
      <header className="mb-8">
        <Link to="/budgets" className="text-sm text-ink-faint">
          ‹ Budgets
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-light">Recurring</h1>
        <p className="text-sm text-ink-mute">Everything that leaves on its own.</p>
      </header>

      {items.length > 0 && (
        <p className="mb-6 text-sm text-ink-mute">
          About <span className="text-ink">{currency.format(monthlyEstimate(items))}</span> a
          month, <span className="text-ink">{currency.format(annualTotal)}</span> a year all
          told.
          {priciest && (
            <span className="block text-xs text-ink-faint">
              {priciest.name} is your priciest at {currency.format(annualCost(priciest))}/yr.
            </span>
          )}
        </p>
      )}

      {risen.length > 0 && (
        <section className="mb-8 card p-4">
          <h2 className="mb-3 label-micro">Prices that rose</h2>
          <ul className="space-y-2">
            {risen.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between text-sm">
                <span>{item.name}</span>
                <span className="text-accent">
                  +{currency.format(item.amount - item.previousAmount!)}
                  <span className="text-ink-faint">
                    {" "}
                    ({currency.format(item.previousAmount!)} → {currency.format(item.amount)})
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-faint">
            That's {currency.format(risen.reduce((s, i) => s + (i.amount - i.previousAmount!) * 12, 0))}{" "}
            more a year than before. Worth a look.
          </p>
        </section>
      )}

      {dueSoon.length > 0 && (
        <section className="mb-8 card p-4">
          <h2 className="mb-3 label-micro">Due soon</h2>
          <ul className="space-y-2">
            {dueSoon.map((item) => {
              const days = daysUntil(item.nextDate);
              return (
                <li key={item.id} className="flex items-baseline justify-between text-sm">
                  <span>
                    {item.name}
                    <span className={`ml-2 text-xs ${days <= 1 ? "text-accent" : "text-ink-faint"}`}>
                      {whenLabel(days)}
                      {item.variable ? " · record it" : ""}
                    </span>
                  </span>
                  <span className="text-ink-mute">
                    {item.variable ? "~" : ""}
                    {currency.format(item.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-ink-faint">
            Fixed ones post themselves; a variable bill (~) waits for you to record its real amount.
          </p>
        </section>
      )}

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-faint">Nothing leaves on its own yet.</p>
      ) : (
        <ul className="divide-y divide-edge">
          {sorted.map((item) => (
            <RecurringRow
              key={item.id}
              item={item}
              categories={categories}
              onChange={replace}
              onDelete={() => remove(item)}
            />
          ))}
        </ul>
      )}

      <div className="mt-10 border-t border-edge pt-6">
        <h2 className="mb-3 label-micro">New recurring</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              className={`${field} min-w-0 flex-1`}
              placeholder="Rent, streaming, the gym…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className={`${field} w-24 text-right`}
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              className={`${field} min-w-0 flex-1`}
              value={cadence}
              onChange={(e) => setCadence(e.target.value as Cadence)}
            >
              {cadences.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input
              className={field}
              type="date"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              className={`${field} min-w-0 flex-1`}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji ? `${c.emoji} ` : ""}
                  {c.name}
                </option>
              ))}
            </select>
            <button onClick={add} className="px-3 text-accent">
              Add
            </button>
          </div>
          <button
            type="button"
            onClick={() => setVariable(!variable)}
            className={`chip py-1 ${variable ? "border-accent text-ink" : "border-edge text-ink-faint"}`}
            role="switch"
            aria-checked={variable}
          >
            {variable ? "✓ " : ""}Variable amount (a utility bill)
          </button>
          <p className="text-xs text-ink-faint">
            {variable
              ? "The amount above is a typical estimate. It won't post on its own; when the bill comes, record the real figure."
              : "Posts itself to the ledger for the amount above when due."}
          </p>
        </div>
      </div>
    </div>
  );
}

function RecurringRow({
  item,
  categories,
  onChange,
  onDelete,
}: {
  item: RecurringItem;
  categories: Category[];
  onChange: (item: RecurringItem) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [amount, setAmount] = useState(String(item.amount));
  const [cadence, setCadence] = useState<Cadence>(item.cadence);
  const [nextDate, setNextDate] = useState(item.nextDate);
  const [categoryId, setCategoryId] = useState(item.categoryId ? String(item.categoryId) : "");
  const [variable, setVariable] = useState(item.variable);
  const [recordAmount, setRecordAmount] = useState("");
  const field = "field-sm";

  function begin() {
    setName(item.name);
    setAmount(String(item.amount));
    setCadence(item.cadence);
    setNextDate(item.nextDate);
    setCategoryId(item.categoryId ? String(item.categoryId) : "");
    setVariable(item.variable);
    setEditing(true);
  }

  async function save() {
    const parsed = Number.parseFloat(amount);
    if (!name.trim() || !Number.isFinite(parsed) || parsed <= 0) return;
    const updated = await api
      .updateRecurring(item.id, {
        name: name.trim(),
        amount: parsed,
        cadence,
        nextDate,
        categoryId: categoryId ? Number(categoryId) : undefined,
        variable,
      })
      .catch(() => null);
    if (updated) {
      onChange(updated);
      setEditing(false);
    }
  }

  async function record() {
    const value = Number.parseFloat(recordAmount);
    if (!Number.isFinite(value) || value <= 0) return;
    const updated = await api.recordRecurring(item.id, value).catch(() => null);
    if (updated) {
      onChange(updated);
      setRecordAmount("");
      haptic();
    }
  }

  if (editing) {
    return (
      <li className="space-y-2 py-3">
        <div className="flex items-center gap-2">
          <input
            className={`${field} min-w-0 flex-1`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Name"
          />
          <input
            className={`${field} w-24 text-right`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Amount"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            className={`${field} min-w-0 flex-1`}
            value={cadence}
            onChange={(e) => setCadence(e.target.value as Cadence)}
            aria-label="Cadence"
          >
            {cadences.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            className={field}
            type="date"
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
            aria-label="Next date"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            className={`${field} min-w-0 flex-1`}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label="Category"
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji ? `${c.emoji} ` : ""}
                {c.name}
              </option>
            ))}
          </select>
          <button onClick={save} className="px-2 text-sm text-accent">
            Save
          </button>
          <button onClick={() => setEditing(false)} className="px-2 text-sm text-ink-faint">
            Cancel
          </button>
        </div>
        <button
          type="button"
          onClick={() => setVariable(!variable)}
          className={`chip py-1 ${variable ? "border-accent text-ink" : "border-edge text-ink-faint"}`}
          role="switch"
          aria-checked={variable}
        >
          {variable ? "✓ " : ""}Variable amount (a utility bill)
        </button>
      </li>
    );
  }

  const dueToRecord = item.variable && daysUntil(item.nextDate) <= 3;

  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-sm">{item.name}</p>
          <p className="text-xs text-ink-faint">
            {item.cadence}
            {item.variable ? " · variable" : ""} · {currency.format(annualCost(item))}/yr · next{" "}
            {new Date(`${item.nextDate}T00:00:00`).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-baseline gap-3">
          <p className="font-serif text-lg">
            {item.variable ? "~" : ""}
            {currency.format(item.amount)}
          </p>
          <button onClick={begin} className="text-sm text-accent">
            Edit
          </button>
          <button onClick={onDelete} className="text-ink-faint" aria-label={`Delete ${item.name}`}>
            ✕
          </button>
        </div>
      </div>
      {dueToRecord && (
        <div className="mt-2 flex items-center gap-2">
          <input
            className="field-sm w-28 text-right"
            inputMode="decimal"
            placeholder="actual"
            value={recordAmount}
            onChange={(e) => setRecordAmount(e.target.value)}
            aria-label={`Actual amount for ${item.name}`}
          />
          <button onClick={record} className="text-sm text-accent">
            Record actual
          </button>
          <span className="text-xs text-ink-faint">the bill's here, log the real figure</span>
        </div>
      )}
    </li>
  );
}
