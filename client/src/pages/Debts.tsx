import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, currency, currentMonth, shiftMonth, today } from "../lib/api";
import { haptic } from "../lib/haptics";
import type { Debt, DebtKind } from "../lib/types";

const kinds: { id: DebtKind; label: string }[] = [
  { id: "ShortTerm", label: "Short-term" },
  { id: "LongTerm", label: "Long-term" },
];

const remaining = (d: Debt) => d.startingAmount - d.paidAmount;

/**
 * When the ledger has entries paying a debt down, read the recent pace and
 * say when the balance reaches zero at that pace. Payments made only on this
 * page (without a ledger entry) don't feed it — the ledger is the record.
 */
function forecast(debt: Debt, paidInWindow: number, windowDays: number): string | null {
  const owed = remaining(debt);
  if (owed <= 0 || paidInWindow <= 0 || windowDays < 14) return null;
  const monthlyRate = paidInWindow / (windowDays / 30.44);
  const monthsLeft = owed / monthlyRate;
  if (monthsLeft <= 1) return "At the ledger's pace, out within the month.";
  if (monthsLeft > 60) return "At the ledger's pace, five years or more. A bigger shovel may be in order.";
  const when = new Date();
  when.setMonth(when.getMonth() + Math.ceil(monthsLeft));
  const label = when.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return `At the ledger's pace of about ${currency.format(monthlyRate)} a month, out around ${label}.`;
}

export default function Debts() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [paceByDebt, setPaceByDebt] = useState<Map<number, number>>(new Map());
  const [windowDays, setWindowDays] = useState(0);
  const [name, setName] = useState("");
  const [starting, setStarting] = useState("");
  const [kind, setKind] = useState<DebtKind>("ShortTerm");

  useEffect(() => {
    api.debts().then(setDebts).catch(() => {});
  }, []);

  // Read the last ~3 months of the ledger for entries that pay debts down.
  useEffect(() => {
    const now = currentMonth();
    const months = [now, shiftMonth(now, -1), shiftMonth(now, -2)];
    Promise.all(months.map((m) => api.entries({ month: m, kind: "Expense", limit: 500 })))
      .then((lists) => {
        const sums = new Map<number, number>();
        for (const entry of lists.flat()) {
          if (entry.debtId == null) continue;
          sums.set(entry.debtId, (sums.get(entry.debtId) ?? 0) + entry.amount);
        }
        setPaceByDebt(sums);
        const start = new Date(`${months[2]}-01T00:00:00`);
        const end = new Date(`${today()}T00:00:00`);
        setWindowDays(Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
      })
      .catch(() => {});
  }, []);

  const shortTerm = debts.filter((d) => d.kind === "ShortTerm");
  const longTerm = debts.filter((d) => d.kind === "LongTerm");
  const shortOwed = shortTerm.reduce((s, d) => s + remaining(d), 0);
  const longOwed = longTerm.reduce((s, d) => s + remaining(d), 0);

  function replace(updated: Debt) {
    setDebts((all) => all.map((d) => (d.id === updated.id ? updated : d)));
  }

  async function add() {
    const startingAmount = Number.parseFloat(starting);
    if (!name.trim() || !Number.isFinite(startingAmount) || startingAmount <= 0) return;
    const created = await api.createDebt({ name: name.trim(), startingAmount, kind });
    setDebts((all) => [...all, created]);
    setName("");
    setStarting("");
  }

  async function remove(debt: Debt) {
    if (!window.confirm(`Close the book on "${debt.name}"?`)) return;
    await api.deleteDebt(debt.id).catch(() => {});
    setDebts((all) => all.filter((d) => d.id !== debt.id));
  }

  function section(title: string, subtitle: string, list: Debt[]) {
    if (list.length === 0) return null;
    return (
      <section className="mb-10">
        <h2 className="label-micro">{title}</h2>
        <p className="mb-4 text-xs text-ink-faint">{subtitle}</p>
        <ul className="space-y-8">
          {list.map((debt) => (
            <DebtRow
              key={debt.id}
              debt={debt}
              forecast={forecast(debt, paceByDebt.get(debt.id) ?? 0, windowDays)}
              onChange={replace}
              onDelete={() => remove(debt)}
            />
          ))}
        </ul>
      </section>
    );
  }

  return (
    <div>
      <header className="mb-8">
        <Link to="/budgets" className="text-sm text-ink-faint">
          ‹ Budgets
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-light">Debts</h1>
        <p className="text-sm text-ink-mute">The slow crawl out.</p>
      </header>

      {debts.length > 0 && (
        <section className="mb-10">
          <p className="label-micro">Still owed, all told</p>
          <p className="mt-2 font-serif text-5xl font-light tracking-tight">
            {currency.format(shortOwed + longOwed)}
          </p>
          {shortOwed > 0 && longOwed > 0 && (
            <p className="mt-2 text-sm text-ink-mute">
              {currency.format(shortOwed)} the crawl out · {currency.format(longOwed)} the long
              road
            </p>
          )}
        </section>
      )}

      {debts.length === 0 && (
        <p className="py-6 text-center text-sm text-ink-faint">
          Nothing owed, or nothing written down yet.
        </p>
      )}

      {section("The crawl out", "Cards and store credit you want gone.", shortTerm)}
      {section(
        "The long road",
        "Car loans and the like: scheduled, expected, no alarm.",
        longTerm,
      )}

      <div className="mt-10 border-t border-edge pt-6">
        <h2 className="mb-3 label-micro">New debt</h2>
        <div className="mb-3 flex gap-2">
          {kinds.map((option) => (
            <button
              key={option.id}
              onClick={() => setKind(option.id)}
              className={`chip py-1.5 ${
                kind === option.id ? "border-accent text-ink" : "border-edge text-ink-faint"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            className="field-sm flex-1"
            placeholder={kind === "ShortTerm" ? "Discover, Best Buy…" : "The car, the degree…"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="field-sm w-28 text-right"
            inputMode="decimal"
            placeholder="Owed"
            value={starting}
            onChange={(e) => setStarting(e.target.value)}
          />
          <button onClick={add} className="px-2 text-accent">
            Add
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          Write down what you owe today; every payment is a step out.
        </p>
      </div>
    </div>
  );
}

function DebtRow({
  debt,
  forecast,
  onChange,
  onDelete,
}: {
  debt: Debt;
  forecast: string | null;
  onChange: (debt: Debt) => void;
  onDelete: () => void;
}) {
  const [amount, setAmount] = useState("");
  const owed = remaining(debt);
  const ratio = debt.startingAmount > 0 ? Math.min(1, debt.paidAmount / debt.startingAmount) : 0;
  const paidOff = owed <= 0;

  async function pay() {
    const value = Number.parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    const updated = await api.payDebt(debt.id, value).catch(() => null);
    if (updated) {
      onChange(updated);
      setAmount("");
      haptic();
    }
  }

  async function grew() {
    const value = Number.parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    const updated = await api
      .updateDebt(debt.id, {
        name: debt.name,
        startingAmount: debt.startingAmount + value,
        kind: debt.kind,
      })
      .catch(() => null);
    if (updated) {
      onChange(updated);
      setAmount("");
    }
  }

  async function reclassify() {
    const updated = await api
      .updateDebt(debt.id, {
        name: debt.name,
        startingAmount: debt.startingAmount,
        kind: debt.kind === "ShortTerm" ? "LongTerm" : "ShortTerm",
      })
      .catch(() => null);
    if (updated) onChange(updated);
  }

  return (
    <li>
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-sm">{debt.name}</p>
        <div className="flex items-baseline gap-2">
          <button onClick={reclassify} className="text-xs text-ink-faint underline decoration-edge">
            {debt.kind === "ShortTerm" ? "move to the long road" : "move to the crawl out"}
          </button>
          <button onClick={onDelete} className="px-1 text-ink-faint" aria-label={`Delete ${debt.name}`}>
            ✕
          </button>
        </div>
      </div>
      {paidOff ? (
        <p className="font-serif text-2xl font-light text-accent">Paid off. Out of the hole.</p>
      ) : (
        <p className="font-serif text-2xl font-light">
          {currency.format(owed)}
          <span className="text-base text-ink-faint"> still owed of {currency.format(debt.startingAmount)}</span>
        </p>
      )}
      <div className="mt-2 h-1.5 w-full rounded-full bg-edge">
        <div className="h-1.5 rounded-full bg-accent" style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="mt-1 text-xs text-ink-faint">
        {currency.format(debt.paidAmount)} paid · {Math.round(ratio * 100)}% of the way out
      </p>
      {forecast && <p className="mt-1 text-xs text-ink-faint">{forecast}</p>}
      <div className="mt-3 flex items-center gap-2">
        <input
          className="field-sm w-28 text-right"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button onClick={pay} className="text-sm text-accent">
          Pay down
        </button>
        <button onClick={grew} className="text-sm text-ink-faint" title="Interest or new charges">
          It grew
        </button>
      </div>
    </li>
  );
}
